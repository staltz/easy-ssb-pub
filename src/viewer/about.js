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
