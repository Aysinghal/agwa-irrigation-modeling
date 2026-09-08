/***********************************************
 * QUICK VIEWER: All assignment points on map
 ***********************************************/

var ASSIGNMENTS_ASSET =
  'projects/irrigation-mapping-agwa/assets/assignments/truss_point_assignments_md_v1';

var assignments = ee.FeatureCollection(ASSIGNMENTS_ASSET);

var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));

var naipMD = ee.ImageCollection('USDA/NAIP/DOQQ')
  .filterBounds(maryland)
  .filterDate('2021-01-01', '2023-12-31')
  .mosaic()
  .clip(maryland);

var colors = {
  ayush:  'red',
  maddie: 'orange',
  mara:   'yellow',
  mike:   'cyan',
  sienna: 'magenta',
  taryn:  'lime',
  tien:   'white'
};

Map.centerObject(maryland, 8);
Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'Maryland NAIP');
Map.addLayer(maryland, {color: 'blue'}, 'Maryland boundary', false);

var users = Object.keys(colors);
for (var i = 0; i < users.length; i++) {
  var user = users[i];
  var userPoints = assignments.filter(ee.Filter.eq('assigned_to', user));
  Map.addLayer(userPoints, {color: colors[user]}, user);
}

Map.addLayer(assignments, {color: 'white'}, 'All points', false);

print('Total assignments:', assignments.size());
for (var j = 0; j < users.length; j++) {
  var u = users[j];
  print(u + ':', assignments.filter(ee.Filter.eq('assigned_to', u)).size());
}
