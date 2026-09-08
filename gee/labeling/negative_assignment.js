/***************************************
 * SCRIPT 6: BUILD NEGATIVE-CANDIDATE ASSIGNMENTS (WEIGHTED)
 *
 * What this does:
 *   1. Loads every CDL field, then REMOVES the exclusion set from Script 5
 *      (any field that touches a positive). What's left = the "probably no
 *      truss" pool.
 *   2. Shuffles that pool once with a fixed random seed (reproducible).
 *   3. Takes the first N_CANDIDATES fields off the shuffled pile.
 *   4. Hands them out to labelers using a WEIGHTED split (non-CS folks get
 *      more, Ayush gets the least) instead of an even round-robin.
 *   5. Exports the assignment table for the Step 7 labeling UI.
 *
 * Run once. One batch export; watch the Tasks tab.
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
// Per-person counts. Must sum to N_CANDIDATES. Tweak numbers here only.
var WEIGHTS = [
  {user: 'maddie', n: 200},   // top tier (non-CS) — most labeling
  {user: 'tien',   n: 200},
  {user: 'taryn',  n: 200},
  {user: 'sienna', n: 120},   // middle tier
  {user: 'mara',   n: 120},
  {user: 'mike',   n: 120},
  {user: 'ayush',  n: 40}     // least — carrying the code
];
var N_CANDIDATES = 1000;
var RANDOM_SEED = 42;          // same seed convention as Script 1

var CDL_FIELDS_ASSET =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_md_2022';
var EXCLUDED_ASSET =
  'projects/irrigation-mapping-agwa/assets/cdl_fields_excluded_md_2022';
var OUTPUT_ASSET_ID =
  'projects/irrigation-mapping-agwa/assets/assignments/negative_field_assignments_md_v1';

// ---------------------------
// SANITY CHECK ON WEIGHTS
// ---------------------------
var weightSum = 0;
WEIGHTS.forEach(function(w) { weightSum += w.n; });
if (weightSum !== N_CANDIDATES) {
  print('WARNING: weights sum to ' + weightSum +
    ' but N_CANDIDATES is ' + N_CANDIDATES + '. Fix the CONFIG.');
}

// ---------------------------
// LOAD SOURCE DATA
// ---------------------------
var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));

var cdlFields = ee.FeatureCollection(CDL_FIELDS_ASSET);
var excluded = ee.FeatureCollection(EXCLUDED_ASSET);

// ---------------------------
// REMOVE THE EXCLUSION SET
// ---------------------------
// We can't trust system:index to match across two separately-exported assets,
// so we build a stable key from each field's centroid (rounded to ~0.1 m).
// The excluded fields ARE unmodified copies of CDL fields, so their centroids
// match exactly — the key lines them up reliably.
function addKey(f) {
  var c = f.geometry().centroid(1).coordinates();
  var lon = ee.Number(c.get(0)).multiply(1e6).round().format('%d');
  var lat = ee.Number(c.get(1)).multiply(1e6).round().format('%d');
  return f.set('field_key', lon.cat('_').cat(lat));
}

var cdlKeyed = cdlFields.map(addKey);
var excludedKeyed = excluded.map(addKey);

// Inverted join = keep only CDL fields with NO match in the excluded set.
var negativePool = ee.Join.inverted().apply({
  primary: cdlKeyed,
  secondary: excludedKeyed,
  condition: ee.Filter.equals({leftField: 'field_key', rightField: 'field_key'})
});

print('CDL fields total (approx — heavy, ok to skip):');
print('Negative pool size (after exclusion):', negativePool.size());

// ---------------------------
// SHUFFLE + TAKE FIRST N_CANDIDATES
// ---------------------------
var shuffled = negativePool
  .randomColumn('rand', RANDOM_SEED)
  .sort('rand');

var selected = ee.FeatureCollection(shuffled.limit(N_CANDIDATES));
var selectedList = selected.toList(N_CANDIDATES);

// ---------------------------
// BUILD WEIGHTED ASSIGNMENT ORDER (client-side)
// ---------------------------
// Expand WEIGHTS into a flat list of length N_CANDIDATES, e.g.
//   [maddie x200, tien x200, ..., ayush x40].
// The pool is already shuffled, so a blocked order still gives each person a
// random subset. We also record each person's local queue position.
var userOrder = [];
var queueOrder = [];
var targetOrder = [];
WEIGHTS.forEach(function(w) {
  for (var k = 0; k < w.n; k++) {
    userOrder.push(w.user);
    queueOrder.push(k);   // 0-based position within this user's queue
    targetOrder.push(w.n); // this user's total target (for the labeling UI)
  }
});
var userOrderList = ee.List(userOrder);
var queueOrderList = ee.List(queueOrder);
var targetOrderList = ee.List(targetOrder);

// ---------------------------
// ASSIGN
// ---------------------------
var assignments = ee.FeatureCollection(
  ee.List.sequence(0, N_CANDIDATES - 1).map(function(i) {
    i = ee.Number(i);
    var f = ee.Feature(selectedList.get(i));
    return f.set({
      assigned_to: ee.String(userOrderList.get(i)),
      queue_index: ee.Number(queueOrderList.get(i)),
      global_rank: i,
      field_id: i,                              // stable label id for Steps 7–8
      n_target: ee.Number(targetOrderList.get(i))
    });
  })
);

// ---------------------------
// VERIFY COUNTS BY USER
// ---------------------------
print('Assignment counts by user (should match CONFIG):');
WEIGHTS.forEach(function(w) {
  print(
    w.user + ' (target ' + w.n + '):',
    assignments.filter(ee.Filter.eq('assigned_to', w.user)).size()
  );
});

// ---------------------------
// PREVIEW
// ---------------------------
Map.centerObject(maryland, 7);
Map.addLayer(maryland, {color: 'blue'}, 'Maryland', false);
Map.addLayer(assignments, {color: 'red'}, 'Negative candidate assignments', true);

// ---------------------------
// EXPORT
// ---------------------------
Export.table.toAsset({
  collection: assignments,
  description: 'export_negative_field_assignments_md_v1',
  assetId: OUTPUT_ASSET_ID
});
