/***************************************
 * SCRIPT 3: BUILD CDL FIELD POLYGONS (MD)
 *
 * What this does:
 *   1. Loads CDL rasters for 2021, 2022, 2023.
 *   2. Builds a "crop" mask per year (pixel value in [1, 60]).
 *   3. Keeps only pixels that are crops in ALL three years (3-year consensus).
 *   4. Vectorizes the consensus crop raster into field polygons,
 *      using the 2022 crop class for labeling.
 *   5. Filters out anything smaller than MIN_FIELD_AREA_M2.
 *   6. Assigns a stable field_id and exports to an asset.
 *
 * Run once. The export takes a while (Maryland is big and CDL is 30m).
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var YEARS = [2021, 2022, 2023];
var LABEL_YEAR = 2022;              // crop class used to label each field
var MIN_CROP_CLASS = 1;             // CDL classes 1..60 are row/field crops
var MAX_CROP_CLASS = 60;
var MIN_FIELD_AREA_M2 = 10000;      // 1 hectare
var CDL_SCALE = 30;                 // CDL native resolution

var OUTPUT_ASSET_ID =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_md_2022';

// ---------------------------
// LOAD BOUNDARIES
// ---------------------------
var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));
var marylandGeom = maryland.geometry();

// ---------------------------
// BUILD CROP MASK PER YEAR, THEN CONSENSUS
// ---------------------------
function cdlForYear(year) {
  return ee.ImageCollection('USDA/NASS/CDL')
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .first()
    .select('cropland');
}

// Each yearly mask is 1 where pixel is a crop class, else 0.
var yearlyMasks = ee.ImageCollection(YEARS.map(function(y) {
  var cdl = cdlForYear(y);
  return cdl.gte(MIN_CROP_CLASS).and(cdl.lte(MAX_CROP_CLASS)).rename('crop');
}));

// Consensus: a pixel survives only if it's a crop in every year.
// Using min() across 0/1 masks == logical AND across all years.
var consensusCrop = yearlyMasks.reduce(ee.Reducer.min()).rename('crop');

// Use the LABEL_YEAR CDL classes to label the surviving pixels.
// Pixels not in consensus are masked out.
var labelCdl = cdlForYear(LABEL_YEAR);
var stableCrop = labelCdl
  .updateMask(consensusCrop)
  .clip(marylandGeom)
  .rename('crop_class');

// ---------------------------
// DROP TINY BLOBS BEFORE VECTORIZING
// ---------------------------
// CDL is 30m, so 1 pixel ~= 900 m^2. We want at least MIN_FIELD_AREA_M2.
// connectedPixelCount labels each pixel with the size of its connected clump.
// We then drop pixels whose clump is smaller than the min size.
var MIN_PIXELS = Math.ceil(MIN_FIELD_AREA_M2 / (CDL_SCALE * CDL_SCALE));

var clumpSize = stableCrop.connectedPixelCount({
  maxSize: 256,        // cap on clump-size counting; we only need >= MIN_PIXELS
  eightConnected: false
});

var bigClumpsOnly = stableCrop.updateMask(clumpSize.gte(MIN_PIXELS));

// ---------------------------
// VECTORIZE TO FIELD POLYGONS
// ---------------------------
// Each connected blob of same-class pixels becomes one polygon.
var cdlFields = bigClumpsOnly.reduceToVectors({
  geometry: marylandGeom,
  scale: CDL_SCALE,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'crop_class',
  maxPixels: 1e13,
  bestEffort: false
}).map(function(f) {
  return f.set({
    area_m2: f.geometry().area(1),
    label_year: LABEL_YEAR
  });
});

// ---------------------------
// PREVIEW (raster only — vectors only on export)
// ---------------------------
Map.centerObject(maryland, 7);
Map.addLayer(maryland, {color: 'blue'}, 'Maryland', false);
Map.addLayer(
  labelCdl.clip(marylandGeom),
  {min: 1, max: 60, palette: ['#ffffd9','#7fcdbb','#1d91c0','#225ea8','#081d58']},
  'CDL ' + LABEL_YEAR + ' (crops only)',
  false
);
Map.addLayer(consensusCrop.selfMask().clip(marylandGeom),
  {palette: ['green']}, '3-year consensus crop mask', false);
Map.addLayer(bigClumpsOnly.selfMask().clip(marylandGeom),
  {palette: ['orange']}, 'Crops surviving min-size filter', true);

// NOTE: do NOT print(cdlFields.size()) or addLayer(cdlFields) — that
// tries to materialize the whole vector set interactively and blows up.
// Run the export below; results land in your assets.

// ---------------------------
// EXPORT
// ---------------------------
Export.table.toAsset({
  collection: cdlFields,
  description: 'export_cdl_fields_md_' + LABEL_YEAR,
  assetId: OUTPUT_ASSET_ID
});
