/***************************************
 * SCRIPT 1: BUILD FIXED MASTER ASSIGNMENT
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USER_NAMES = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];
var USERS = ee.List(USER_NAMES);
var N_TARGET = 100;     // required completed labels per person
var N_RESERVE = 20;     // extra points per person to absorb skips
var RANDOM_SEED = 42;

var OUTPUT_ASSET_ID =
  'projects/irrigation-mapping-agwa/assets/assignments/truss_point_assignments_md_v1';

// ---------------------------
// LOAD SOURCE DATA
// ---------------------------
var pivots = ee.FeatureCollection(
  'projects/irrigation-mapping-agwa/assets/center_pivot_irrigation_trusses'
);

var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));

var marylandGeom = maryland.geometry();
var pivotsMD = pivots
  .filterBounds(maryland)
  .filter(ee.Filter.isContained('.geo', marylandGeom));

// Convert polygons to centroid points.
// Copy original attributes if useful.
var pivotPoints = pivotsMD.map(function(feature) {
  return ee.Feature(
    feature.geometry().centroid(1),
    feature.toDictionary()
  );
});

// Add a stable point_id.
// We first sort deterministically, then use toList() + index to assign IDs.
// For reproducibility, sort by lon/lat-ish proxy using centroid coords.
var withCoords = pivotPoints.map(function(f) {
  var coords = f.geometry().coordinates();
  return f.set({
    lon: coords.get(0),
    lat: coords.get(1)
  });
}).sort('lon').sort('lat');

var totalNeeded = USER_NAMES.length * (N_TARGET + N_RESERVE);

// Convert to a list so we can assign stable IDs and round-robin users.
var pointList = withCoords.toList(withCoords.size());
var totalAvailable = withCoords.size();

print('Total candidate points in Maryland:', totalAvailable);
print('Total points needed:', totalNeeded);

// Randomize globally once, then assign round-robin across the shuffled list.
var indexed = ee.FeatureCollection(
  ee.List.sequence(0, totalAvailable.subtract(1)).map(function(i) {
    i = ee.Number(i);
    var f = ee.Feature(pointList.get(i));
    return f.set({
      point_id: i,   // stable ID before randomization
      stable_idx: i
    });
  })
);

var shuffled = indexed
  .randomColumn('rand', RANDOM_SEED)
  .sort('rand');

// Keep only first 7 * (n_target + reserve)
var selected = ee.FeatureCollection(shuffled.limit(totalNeeded));

// Re-list after shuffle so we can assign queue positions and round-robin users.
var selectedList = selected.toList(selected.size());
var selectedCount = selected.size();

var assignments = ee.FeatureCollection(
  ee.List.sequence(0, selectedCount.subtract(1)).map(function(i) {
    i = ee.Number(i);
    var f = ee.Feature(selectedList.get(i));

    var userIndex = i.mod(USER_NAMES.length);
    var queueIndex = i.divide(USER_NAMES.length).floor();

    return f.set({
      assigned_to: ee.String(USERS.get(userIndex)),
      queue_index: queueIndex,
      global_rank: i,
      n_target: N_TARGET,
      n_reserve: N_RESERVE
    });
  })
);

print('Assignment counts by user:');
USER_NAMES.forEach(function(user) {
  print(
    user,
    assignments.filter(ee.Filter.eq('assigned_to', user)).size()
  );
});

Map.centerObject(maryland, 7);
Map.addLayer(maryland, {color: 'blue'}, 'Maryland');
Map.addLayer(selected, {color: 'yellow'}, 'Selected shuffled pool');
Map.addLayer(assignments, {color: 'red'}, 'Assignments');

// Export master assignment table
Export.table.toAsset({
  collection: assignments,
  description: 'export_truss_point_assignments_md_v1',
  assetId: OUTPUT_ASSET_ID
});