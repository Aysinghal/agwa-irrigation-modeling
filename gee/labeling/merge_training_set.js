/***************************************
 * SCRIPT 8: BUILD FINAL TRAINING SET
 *
 * What this does:
 *   1. Loads the positive CDL fields (Script 5)        -> label_class 1.
 *   2. Loads every confirmed negative across all users -> label_class 0.
 *   3. BACKSTOP: drops any confirmed negative that overlaps the OLD legacy
 *      truss dataset at all (catches labeler misses — a field a labeler
 *      called "negative" that the legacy data says had a truss).
 *   4. Merges positives + clean negatives into one labeled asset for training.
 *
 * Run once. One batch export; watch the Tasks tab.
 *
 * Note on the backstop: the legacy dataset is OLD, so a few dropped negatives
 * may actually be truss-free today. That's the safe trade — a clean negative
 * set matters more, and the ~300-field candidate buffer absorbs the loss.
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];

var POSITIVE_ASSET =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_positive_md_2022';
var NEG_LABELS_BASE =
  'projects/irrigation-mapping-agwa/assets/labels_negative/';
var LEGACY_TRUSS_ASSET =
  'projects/irrigation-mapping-agwa/assets/center_pivot_irrigation_trusses';

var OUTPUT_ASSET_ID =
  'projects/irrigation-mapping-agwa/assets/training_fields_md_2022';

var PIXEL_SCALE = 10;   // same 10m raster convention as Scripts 4/5

// ---------------------------
// LOAD POSITIVES
// ---------------------------
// Normalize to a minimal common schema: geometry + label_class + sample_type.
var positives = ee.FeatureCollection(POSITIVE_ASSET).map(function(f) {
  return ee.Feature(f.geometry(), {
    label_class: 1,
    sample_type: 'positive'
  });
});

// ---------------------------
// LOAD ALL CONFIRMED NEGATIVES ACROSS USERS
// ---------------------------
// Each user's labels_negative folder holds field_<id>_confirmed assets,
// one polygon each. List client-side, merge server-side (same pattern as
// loadAllPositives in Scripts 4/5).
function loadAllConfirmedNegatives() {
  var merged = ee.FeatureCollection([]);
  var totalAssets = 0;

  USERS.forEach(function(user) {
    var folder = NEG_LABELS_BASE + user;
    var result;
    try {
      result = ee.data.listAssets(folder);
    } catch (e) {
      print('Skipping (no folder):', user);
      return;
    }
    if (!result || !result.assets) return;

    result.assets.forEach(function(asset) {
      var name = asset.id.split('/').pop();
      if (!/^field_\d+_confirmed$/.test(name)) return;

      var fc = ee.FeatureCollection(asset.id).map(function(f) {
        return ee.Feature(f.geometry(), {
          label_class: 0,
          sample_type: 'negative',
          source_labeler: user
        });
      });
      merged = merged.merge(fc);
      totalAssets += 1;
    });
  });

  print('Confirmed negative label assets found:', totalAssets);
  return merged;
}

var negativesRaw = loadAllConfirmedNegatives();

// ---------------------------
// BACKSTOP: DROP NEGATIVES THAT TOUCH A LEGACY TRUSS
// ---------------------------
// Rasterize the legacy trusses to a 10m mask, then count mask pixels inside
// each confirmed negative. "Any overlap" => keep only fields with 0 pixels.
// (Raster path, same as Scripts 4/5 — fast and avoids interactive timeouts.)
var legacy = ee.FeatureCollection(LEGACY_TRUSS_ASSET);

var legacyMask = legacy
  .map(function(f) { return f.set('one', 1); })
  .reduceToImage({properties: ['one'], reducer: ee.Reducer.first()})
  .gt(0)
  .unmask(0)
  .rename('is_legacy_truss');

var negativesChecked = legacyMask.reduceRegions({
  collection: negativesRaw,
  reducer: ee.Reducer.sum().setOutputs(['legacy_pixels']),
  scale: PIXEL_SCALE
});

var negativesClean = negativesChecked
  .filter(ee.Filter.eq('legacy_pixels', 0))
  .map(function(f) {
    // Drop the bookkeeping column so the negative schema matches positives.
    return f.select(['label_class', 'sample_type', 'source_labeler']);
  });

var negativesDropped = negativesChecked
  .filter(ee.Filter.gt('legacy_pixels', 0));

// ---------------------------
// MERGE + REPORT
// ---------------------------
var trainingSet = positives.merge(negativesClean);

ee.Dictionary({
  n_positive: positives.size(),
  n_negative_confirmed: negativesRaw.size(),
  n_negative_dropped_legacy: negativesDropped.size(),
  n_negative_kept: negativesClean.size(),
  n_total: trainingSet.size()
}).evaluate(function(d, err) {
  if (err) { print('Count error:', err); return; }
  print('=== STEP 8 TRAINING SET ===');
  print('Positives (label_class 1):', d.n_positive);
  print('Negatives confirmed by labelers:', d.n_negative_confirmed);
  print('  - dropped (legacy truss overlap):', d.n_negative_dropped_legacy);
  print('  - kept (label_class 0):', d.n_negative_kept);
  print('TOTAL training fields:', d.n_total);
  print('Positive : negative ratio ~ 1 :',
    (d.n_negative_kept / d.n_positive).toFixed(2));
  print('Start the export from the Tasks tab ->');
});

// ---------------------------
// PREVIEW
// ---------------------------
var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));
Map.centerObject(maryland, 7);
Map.addLayer(positives, {color: 'lime'}, 'Positives (class 1)', true);
Map.addLayer(negativesClean, {color: 'red'}, 'Negatives kept (class 0)', true);
Map.addLayer(negativesDropped, {color: 'orange'},
  'Negatives DROPPED (legacy overlap)', true);

// ---------------------------
// EXPORT
// ---------------------------
Export.table.toAsset({
  collection: trainingSet,
  description: 'export_training_fields_md_2022',
  assetId: OUTPUT_ASSET_ID
});
