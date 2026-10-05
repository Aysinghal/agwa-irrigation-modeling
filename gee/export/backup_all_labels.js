/***************************************
 * BACKUP: PULL EVERY IRREPLACEABLE ASSET OUT OF EARTH ENGINE
 *
 * This is insurance, not a data product. It does no cleaning, no joining, and
 * no filtering. It copies the human-made assets out of Earth Engine into Drive
 * so they exist in more than one place.
 *
 * Run this BEFORE any cleanup or restructuring work.
 *
 * Why it exists: roughly 1500 hand-labeling decisions made by seven people live
 * in exactly one Earth Engine project with no copy anywhere else. Every other
 * asset in the project can be rebuilt from published data and the vendored
 * scripts. These cannot. See spec/pipeline.md.
 *
 * What it does:
 *   1. Walks the four per-labeler folder trees, listing every asset.
 *   2. Merges each tree into ONE FeatureCollection, tagging every feature with
 *      the asset name it came from and the labeler who made it.
 *   3. Exports one file per tree, plus the two assignment tables.
 *
 * Six export tasks, not fifteen hundred. Start them all from the Tasks tab.
 *
 * IMPORTANT — properties are added with .set(), never by constructing a new
 * ee.Feature(). Building a feature as ee.Feature(f.geometry(), {...}) silently
 * discards every property that is not listed, which is how the merged training
 * asset ended up holding only geometry and a class label.
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];

var BASE = 'projects/irrigation-mapping-agwa/assets/';

var DRIVE_FOLDER = 'agwa_ee_backup';   // created in your Drive if absent

// The four human-generated trees. `pattern` selects the assets to keep and
// captures the numeric id embedded in the asset name; `idProp` is where that
// captured id is stored on every feature.
var TREES = [
  {
    name: 'positive_labels',
    base: BASE + 'labels/',
    pattern: /^point_(\d+)_label$/,
    idProp: 'source_point_id',
    note: 'Hand-drawn positive polygons. The single most irreplaceable asset.'
  },
  {
    name: 'positive_progress',
    base: BASE + 'progress/',
    pattern: /^point_(\d+)_(completed|skipped)$/,
    idProp: 'source_point_id',
    note: 'Progress markers incl. written skip reasons (raw material for A-04).'
  },
  {
    name: 'negative_labels',
    base: BASE + 'labels_negative/',
    pattern: /^field_(\d+)_confirmed$/,
    idProp: 'source_queue_id',
    note: 'Confirmed negative fields.'
  },
  {
    name: 'negative_progress',
    base: BASE + 'progress_negative/',
    pattern: /^field_(\d+)_(confirmed|rejected)$/,
    idProp: 'source_queue_id',
    note: 'Progress markers incl. written reject reasons.'
  }
];

// Small, deterministic, but cheap to copy and they define who labeled what.
var ASSIGNMENT_TABLES = [
  { name: 'truss_point_assignments',   id: BASE + 'assignments/truss_point_assignments_md_v1' },
  { name: 'negative_field_assignments', id: BASE + 'assignments/negative_field_assignments_md_v1' }
];

// ---------------------------
// LIST A FOLDER, FOLLOWING PAGINATION
// ---------------------------
// ee.data.listAssets returns a page at a time. Ignoring nextPageToken silently
// truncates large folders, which for a backup would be the worst possible bug:
// it succeeds, and you only find out what is missing when you need it.
function listFolder(folder) {
  var out = [];
  var pageToken = null;

  do {
    var params = { pageSize: 500 };
    if (pageToken) { params.pageToken = pageToken; }

    var res;
    try {
      res = ee.data.listAssets(folder, params);
    } catch (e) {
      return null;                       // folder does not exist
    }
    if (!res) { break; }
    if (res.assets) { out = out.concat(res.assets); }
    pageToken = res.nextPageToken || null;
  } while (pageToken);

  return out;
}

// ---------------------------
// LOAD ONE TREE INTO ONE COLLECTION
// ---------------------------
function loadTree(tree) {
  var parts = [];
  var perUser = {};
  var skipped = [];
  var total = 0;

  USERS.forEach(function(user) {
    var assets = listFolder(tree.base + user);

    if (assets === null) {
      skipped.push(user);
      perUser[user] = 0;
      return;
    }

    var kept = 0;

    assets.forEach(function(asset) {
      var shortName = asset.id.split('/').pop();
      var m = shortName.match(tree.pattern);
      if (!m) { return; }

      // Everything after the captured id, for the trees whose names encode a
      // state: point_12_skipped -> 'skipped'. Empty string for label trees.
      var state = m[2] || '';

      var props = {
        source_labeler: user,
        source_asset: shortName
      };
      props[tree.idProp] = parseInt(m[1], 10);
      if (state) { props.marker_state = state; }

      parts.push(ee.FeatureCollection(asset.id).map(function(f) {
        return f.set(props);           // .set() keeps every existing property
      }));

      kept += 1;
    });

    perUser[user] = kept;
    total += kept;
  });

  // Flatten a list of collections rather than chaining .merge() repeatedly —
  // a 1500-deep merge chain is slow to plan and can blow the request size.
  var merged = ee.FeatureCollection(parts).flatten();

  return {
    fc: merged,
    assetCount: total,
    perUser: perUser,
    skippedUsers: skipped
  };
}

// ---------------------------
// WALK EVERY TREE AND REPORT
// ---------------------------
print('================================================');
print('EARTH ENGINE BACKUP');
print('Asset counts below are what THIS SCRIPT FOUND.');
print('Check them against what you expect before trusting the backup.');
print('================================================');

var loaded = {};
var grandTotalAssets = 0;

TREES.forEach(function(tree) {
  var r = loadTree(tree);
  loaded[tree.name] = r;
  grandTotalAssets += r.assetCount;

  print('--- ' + tree.name + ' ---');
  print(tree.note);
  print('assets found:', r.assetCount);
  print('per labeler:', r.perUser);
  if (r.skippedUsers.length) {
    print('!! NO FOLDER for these labelers:', r.skippedUsers);
    print('!! Either they wrote nothing, or a path is wrong. Check before exporting.');
  }
  // Feature count can exceed asset count if any single asset holds more than
  // one polygon. Worth knowing; not necessarily wrong.
  print('features (server count):', r.fc.size());
});

print('================================================');
print('TOTAL human-generated assets found:', grandTotalAssets);
print('If this is far from ~1500 across the label trees, STOP and investigate.');
print('================================================');

// ---------------------------
// PREVIEW ON THE MAP
// ---------------------------
var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));
Map.centerObject(maryland, 7);
Map.addLayer(maryland, {color: 'cccccc'}, 'Maryland', false);
Map.addLayer(loaded.positive_labels.fc, {color: 'lime'},
  'Hand-drawn positives', true);
Map.addLayer(loaded.negative_labels.fc, {color: 'red'},
  'Confirmed negatives', true);

// ---------------------------
// EXPORTS
// ---------------------------
// GeoJSON preserves geometry exactly and is readable without Earth Engine.
// CSV is also written for the two label trees so the tables can be eyeballed
// and diffed in git without a GIS tool.
TREES.forEach(function(tree) {
  var fc = loaded[tree.name].fc;

  Export.table.toDrive({
    collection: fc,
    description: 'backup_' + tree.name + '_geojson',
    folder: DRIVE_FOLDER,
    fileNamePrefix: 'backup_' + tree.name,
    fileFormat: 'GeoJSON'
  });

  Export.table.toDrive({
    collection: fc,
    description: 'backup_' + tree.name + '_csv',
    folder: DRIVE_FOLDER,
    fileNamePrefix: 'backup_' + tree.name,
    fileFormat: 'CSV'
  });
});

ASSIGNMENT_TABLES.forEach(function(t) {
  Export.table.toDrive({
    collection: ee.FeatureCollection(t.id),
    description: 'backup_' + t.name + '_geojson',
    folder: DRIVE_FOLDER,
    fileNamePrefix: 'backup_' + t.name,
    fileFormat: 'GeoJSON'
  });
});

print('Exports queued. Open the Tasks tab and run each one.');
print('Files land in Drive folder: ' + DRIVE_FOLDER);
