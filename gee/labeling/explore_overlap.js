/***************************************
 * SCRIPT 4: EXPLORE OVERLAP RATIOS
 *
 * What this does:
 *   1. Loads every hand-drawn positive label across all 7 labelers.
 *   2. Loads the CDL fields asset from Script 3.
 *   3. For every CDL field that touches any positive, computes:
 *        overlap_ratio = (positive ∩ field area) / (field area)
 *   4. Color-codes those fields by overlap-ratio bucket so you can
 *      eyeball a good threshold.
 *
 * Use:
 *   - Toggle the bucket layers on/off.
 *   - Click any field in the Inspector tab to see its exact ratio.
 *   - Once you've picked a threshold, copy it into Script 5.
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];
var LABELS_BASE = 'projects/irrigation-mapping-agwa/assets/labels/';
var CDL_FIELDS_ASSET =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_md_2022';

// ---------------------------
// LOAD MARYLAND + NAIP (for context)
// ---------------------------
var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));

var naipMD = ee.ImageCollection('USDA/NAIP/DOQQ')
  .filterBounds(maryland)
  .filterDate('2021-01-01', '2023-12-31')
  .mosaic()
  .clip(maryland);

// ---------------------------
// LOAD ALL POSITIVE LABELS ACROSS USERS
// ---------------------------
// Each user's folder contains assets like point_<id>_label.
// Each asset is a tiny FeatureCollection with one polygon.
// We list them client-side, then merge into one server-side FeatureCollection.
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

// ---------------------------
// LOAD CDL FIELDS
// ---------------------------
var cdlFields = ee.FeatureCollection(CDL_FIELDS_ASSET);

// ---------------------------
// COMPUTE OVERLAP RATIOS (raster path)
// ---------------------------
// Polygon-by-polygon intersection times out interactively. Instead:
//   1. Rasterize all positives once to a 10m binary mask (1 = inside a
//      positive polygon, 0 = outside).
//   2. Use reduceRegions to count "1" pixels inside each candidate CDL
//      field. This is GEE's most-optimized operation.
//   3. overlap_area_m2 = pixel_count * (PIXEL_SCALE^2).
//
// 10m scale means each pixel is 100 m². For ~1 hectare fields, that's
// ~100 pixels per field — plenty of precision for a threshold decision.
var PIXEL_SCALE = 10;
var PIXEL_AREA = PIXEL_SCALE * PIXEL_SCALE;  // 100 m²

print('Rasterizing positives to ' + PIXEL_SCALE + 'm mask...');
var positiveMask = positives
  .map(function(f) { return f.set('one', 1); })
  .reduceToImage({properties: ['one'], reducer: ee.Reducer.first()})
  .gt(0)
  .unmask(0)
  .rename('is_positive');

print('Filtering CDL fields to candidates near positives...');
var candidates = cdlFields.filterBounds(positives);

print('Counting positive pixels per candidate field...');
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
    // Pixel-grid sampling can overcount near field boundaries (a pixel
    // whose center is inside the field is counted whole, even if part
    // of it falls outside). Cap at 1.0 — a field can't be more than
    // 100% positive by definition.
    var rawRatio = overlapArea.divide(fieldArea);
    // Cap just under 1 so the fixedHistogram's [0.95, 1.0) bucket
    // actually catches these values. Capping at exactly 1.0 would
    // push them outside the histogram's range.
    var ratio = rawRatio.min(0.9999);
    return f.set({
      overlap_ratio: ratio,
      overlap_area_m2: ratio.multiply(fieldArea),
      raw_overlap_ratio: rawRatio
    });
  })
  .filter(ee.Filter.gt('overlap_ratio', 0));

// ---------------------------
// STATS + AUTO RECOMMENDATION
// ---------------------------
// One server-side reducer call gives us histogram + percentiles + count
// together — much faster than 20 manual aggregate_array passes.
print('Running stats reducer (may take ~30s)...');

var statsReducer = ee.Reducer.fixedHistogram({min: 0, max: 1, steps: 20})
  .combine({
    reducer2: ee.Reducer.percentile([10, 25, 50, 75, 90]),
    sharedInputs: true
  });

var stats = touched.reduceColumns({
  reducer: statsReducer,
  selectors: ['overlap_ratio']
});

ee.Dictionary({
  n_positives: positives.size(),
  n_fields_touched: touched.size(),
  stats: stats
}).evaluate(function(d, err) {
  if (err) { print('Stats error:', err); return; }

  print('=== OVERLAP DISTRIBUTION ===');
  print('Positive labels loaded:', d.n_positives);
  print('CDL fields touched by any positive:', d.n_fields_touched);

  // fixedHistogram returns array of [bucket_low_edge, count] rows.
  var histRows = d.stats.histogram;
  var hist = histRows.map(function(r) { return r[1]; });

  print('Percentiles (P10/P25/P50/P75/P90):',
    d.stats.p10.toFixed(3), '/',
    d.stats.p25.toFixed(3), '/',
    d.stats.p50.toFixed(3), '/',
    d.stats.p75.toFixed(3), '/',
    d.stats.p90.toFixed(3));

  // Pretty-print histogram as text bars.
  var maxCount = Math.max.apply(null, hist);
  print('--- Histogram (5% buckets) ---');
  for (var i = 0; i < hist.length; i++) {
    var lo = (i * 5).toString();
    if (lo.length === 1) lo = '  ' + lo; else if (lo.length === 2) lo = ' ' + lo;
    var hi = ((i + 1) * 5).toString();
    if (hi.length === 1) hi = '  ' + hi; else if (hi.length === 2) hi = ' ' + hi;
    var count = hist[i];
    var barLen = maxCount === 0 ? 0 : Math.round((count / maxCount) * 40);
    var bar = '';
    for (var b = 0; b < barLen; b++) bar += '█';
    print(lo + '–' + hi + '%  ' + bar + ' (' + count + ')');
  }

  // Auto-recommend the threshold = the LOWEST-count bucket between the
  // sliver peak (lower) and the real-match peak (upper).
  var rightPeakIdx = 0;
  var rightPeakCount = 0;
  for (var j = 10; j < hist.length; j++) {  // search from 50% up
    if (hist[j] > rightPeakCount) {
      rightPeakCount = hist[j];
      rightPeakIdx = j;
    }
  }
  var leftPeakIdx = 0;
  var leftPeakCount = 0;
  for (var k = 0; k < 6; k++) {  // search 0–30%
    if (hist[k] > leftPeakCount) {
      leftPeakCount = hist[k];
      leftPeakIdx = k;
    }
  }
  var valleyIdx = leftPeakIdx;
  var valleyCount = hist[leftPeakIdx];
  for (var m = leftPeakIdx; m <= rightPeakIdx; m++) {
    if (hist[m] < valleyCount) {
      valleyCount = hist[m];
      valleyIdx = m;
    }
  }
  var recommendedThreshold = (valleyIdx + 1) * 5;

  print('--- Recommendation ---');
  print('Sliver cluster peak: ' +
    (leftPeakIdx * 5) + '–' + ((leftPeakIdx + 1) * 5) + '% (' + leftPeakCount + ' fields)');
  print('Real-match cluster peak: ' +
    (rightPeakIdx * 5) + '–' + ((rightPeakIdx + 1) * 5) + '% (' + rightPeakCount + ' fields)');
  print('Valley between them: ' +
    (valleyIdx * 5) + '–' + ((valleyIdx + 1) * 5) + '% (' + valleyCount + ' fields)');
  print('>>> Suggested threshold: ' + recommendedThreshold + '% <<<');
  print('(Higher = stricter / fewer positives. Lower = more permissive.)');

  if (rightPeakCount < 5 || leftPeakCount < 5) {
    print('WARNING: not enough data on one side. Eyeball the map and pick manually.');
  } else if (valleyCount > Math.min(leftPeakCount, rightPeakCount) * 0.5) {
    print('WARNING: weak valley — not cleanly bimodal. Eyeball the map.');
  }

  // Add map layers AFTER stats print so they don't fight for compute.
  addMapLayers();
});

// ---------------------------
// MAP LAYERS (deferred until stats finish)
// ---------------------------
function bucketLayer(fc, lo, hi, color, name, shownByDefault) {
  var sub = fc.filter(ee.Filter.and(
    ee.Filter.gte('overlap_ratio', lo),
    ee.Filter.lt('overlap_ratio', hi)
  ));
  Map.addLayer(sub, {color: color}, name, shownByDefault);
}

function addMapLayers() {
  Map.centerObject(maryland, 8);
  Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'NAIP', true);
  Map.addLayer(positives, {color: 'magenta'}, 'Hand-drawn positives', true);

  bucketLayer(touched, 0.00, 0.10, '#440154', '0–10% overlap',   false);
  bucketLayer(touched, 0.10, 0.30, '#3b528b', '10–30% overlap',  true);
  bucketLayer(touched, 0.30, 0.50, '#21918c', '30–50% overlap',  true);
  bucketLayer(touched, 0.50, 0.70, '#5ec962', '50–70% overlap',  true);
  bucketLayer(touched, 0.70, 1.01, '#fde725', '70–100% overlap', true);
}

// ---------------------------
// INSPECTOR HELPER
// ---------------------------
// Click any CDL field on the map. We find the field at the click point
// and print its ratio + properties to the console.
var clickLabel = ui.Label('Click a CDL field to see its overlap ratio.', {
  fontSize: '12px', color: '#444'
});
Map.add(clickLabel);

Map.onClick(function(coords) {
  var pt = ee.Geometry.Point([coords.lon, coords.lat]);
  var hit = touched.filterBounds(pt).first();
  hit.evaluate(function(f) {
    if (!f) {
      clickLabel.setValue('No CDL field with positive overlap here.');
      return;
    }
    var p = f.properties;
    var ratioPct = (p.overlap_ratio * 100).toFixed(1);
    clickLabel.setValue(
      'field_id ' + (p['system:index'] || '?') +
      ' | overlap: ' + ratioPct + '%' +
      ' | area: ' + Math.round(p.area_m2) + ' m²' +
      ' | n_positives: ' + p.n_positives_touching
    );
    print('Clicked field:', f);
  });
});
