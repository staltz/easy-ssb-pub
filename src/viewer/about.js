/*
easy-ssb-pub: an easy way to deploy a Secure Scuttlebutt Pub.

Copyright (C) 2017 Andre 'Staltz' Medeiros (staltz.com)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var pull = require("pull-stream");
var sort = require("ssb-sort");

function linkDest(val) {
  return typeof val === "string" ? val : val && val.link;
}

function reduceAbout(about, msg) {
  var c = msg.value.content;
  if (!c) return about;
  if (c.name) about.name = c.name.replace(/^@?/, "@");
  if (c.image) about.image = linkDest(c.image);
  return about;
}

module.exports = function(sbot, id, cb) {
  var about = {};
  pull(
    sbot.links({
      rel: "about",
      dest: id,
      values: true
    }),
    pull.collect(function(err, msgs) {
      if (err) return cb(err);
      cb(
        null,
        sort(msgs).reduce(reduceAbout, {
          name: String(id).substr(0, 10) + "…"
        })
      );
    })
  );
};
