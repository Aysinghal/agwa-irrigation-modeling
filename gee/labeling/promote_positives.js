/***************************************
 * SCRIPT 5: PROMOTE POSITIVES + BUILD EXCLUSION SET
 *
 * What this does:
 *   1. Recomputes the overlap ratio of every CDL field against the
 *      hand-drawn positives (same raster path as Script 4).
 *   2. Exports two assets:
 *        a) cdl_fields_positive_md_2022  — fields with overlap_ratio >= THRESHOLD.
 *           These ARE the positive training fields.
 *        b) cdl_fields_excluded_md_2022  — every field that touches ANY positive
 *           (overlap_ratio > 0), even slivers below threshold. This is the
 *           exclusion zone: negatives must NOT be sampled from here, because a
 *           below-threshold touch still means a truss is nearby.
 *
 * Run once. Two batch exports (a few minutes each); watch the Tasks tab.
 *
 * Threshold decided in Script 4: 0.65 (middle of the bimodal valley).
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];
var LABELS_BASE = 'projects/irrigation-mapping-agwa/assets/labels/';
var CDL_FIELDS_ASSET =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_md_2022';

var THRESHOLD = 0.65;               // overlap_ratio cutoff for "positive"
var PIXEL_SCALE = 10;               // overlap raster scale (matches Script 4)
var PIXEL_AREA = PIXEL_SCALE * PIXEL_SCALE;  // 100 m²

var POSITIVE_ASSET_ID =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_positive_md_2022';
var EXCLUDED_ASSET_ID =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_excluded_md_2022';

// ---------------------------
// LOAD ALL POSITIVE LABELS ACROSS USERS
// ---------------------------
// (Same loader as Script 4: each user folder holds point_<id>_label assets,
// one polygon each; we list them client-side and merge server-side.)
function loadAllPositives() {
  var merged = ee.FeatureCollection([]);
  var totalAssets = 0;

  USERS.forEach(function(user) {
    var folder = LABELS_BASE + user;
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
      if (!/^point_\d+_label$/.test(name)) return;

      var fc = ee.FeatureCollection(asset.id).map(function(f) {
        return f.set('source_labeler', user);
      });
      merged = merged.merge(fc);
      totalAssets += 1;
    });
  });

  print('Positive label assets found:', totalAssets);
  return merged;
}

var positives = loadAllPositives();
var cdlFields = ee.FeatureCollection(CDL_FIELDS_ASSET);

// ---------------------------
// COMPUTE OVERLAP RATIOS (raster path — identical to Script 4)
// ---------------------------
var positiveMask = positives
  .map(function(f) { return f.set('one', 1); })
  .reduceToImage({properties: ['one'], reducer: ee.Reducer.first()})
  .gt(0)
  .unmask(0)
  .rename('is_positive');

// Only fields near a positive can touch one — prune first for speed.
var candidates = cdlFields.filterBounds(positives);

var touched = positiveMask
  .reduceRegions({
    collection: candidates,
    reducer: ee.Reducer.sum().setOutputs(['positive_pixels']),
    scale: PIXEL_SCALE
  })
  .map(function(f) {
    var pixels = ee.Number(f.get('positive_pixels'));
    var fieldArea = f.geometry().area(1);
    var overlapArea = pixels.multiply(PIXEL_AREA);
    var rawRatio = overlapArea.divide(fieldArea);
    // Cap just under 1 (boundary pixels can overcount past 100%); see Script 4.
    var ratio = rawRatio.min(0.9999);
    return f.set({
      overlap_ratio: ratio,
      overlap_area_m2: ratio.multiply(fieldArea),
      raw_overlap_ratio: rawRatio
    });
  })
  .filter(ee.Filter.gt('overlap_ratio', 0));

// ---------------------------
// SPLIT INTO POSITIVES + EXCLUSION SET
// ---------------------------
// Positives: clean, high-overlap matches -> training positives.
var positiveFields = touched.filter(
  ee.Filter.gte('overlap_ratio', THRESHOLD)
);

// Exclusion set: EVERY touched field (incl. slivers). Negatives are sampled
// from CDL fields NOT in this set in Step 6.
var excludedFields = touched;

// Quick sanity counts (cheap; exports below do the heavy lifting).
ee.Dictionary({
  threshold: THRESHOLD,
  n_positive_fields: positiveFields.size(),
  n_excluded_fields: excludedFields.size()
}).evaluate(function(d, err) {
  if (err) { print('Count error:', err); return; }
  print('=== STEP 5 SPLIT ===');
  print('Threshold:', d.threshold);
  print('Positive fields (>= threshold):', d.n_positive_fields);
  print('Excluded fields (any touch):', d.n_excluded_fields);
  print('Below-threshold slivers (excluded but not positive):',
    d.n_excluded_fields - d.n_positive_fields);
  print('Start both exports from the Tasks tab ->');
});

// ---------------------------
// EXPORTS
// ---------------------------
Export.table.toAsset({
  collection: positiveFields,
  description: 'export_cdl_fields_positive_md_2022',
  assetId: POSITIVE_ASSET_ID
});

Export.table.toAsset({
  collection: excludedFields,
  description: 'export_cdl_fields_excluded_md_2022',
  assetId: EXCLUDED_ASSET_ID
});
