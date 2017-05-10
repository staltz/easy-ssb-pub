var fs = require("fs");
var qs = require("querystring");
var path = require("path");
var crypto = require("crypto");
var cat = require("pull-cat");
var pull = require("pull-stream");
var paramap = require("pull-paramap");
var marked = require("ssb-marked");
var sort = require("ssb-sort");
var toPull = require("stream-to-pull-stream");
var memo = require("asyncmemo");
var lru = require("lrucache");
var htime = require("human-time");
var emojis = require("emoji-named-characters");
var serveEmoji = require("emoji-server")();
var createDebug = require('debug');

var debug = createDebug('ssb-viewer');
var emojiDir = path.join(require.resolve("emoji-named-characters"), "../pngs");
var appHash = hash([fs.readFileSync(__filename)]);

var urlIdRegex = /^(?:\/(([%&@]|%25|%26|%40)(?:[A-Za-z0-9\/+]|%2[Ff]|%2[Bb]){43}(?:=|%3[Dd])\.(?:sha256|ed25519))(?:\.([^?]*))?|(\/.*?))(?:\?(.*))?$/;

function MdRenderer(opts) {
  marked.Renderer.call(this, {});
  this.opts = opts;
}
MdRenderer.prototype = new marked.Renderer();

MdRenderer.prototype.urltransform = function(href) {
  if (!href) return false;
  switch (href[0]) {
    case "#":
      return this.opts.base + "channel/" + href.slice(1);
    case "%":
      return this.opts.msg_base + encodeURIComponent(href);
    case "@":
      return this.opts.feed_base + encodeURIComponent(href);
    case "&":
      return this.opts.blob_base + encodeURIComponent(href);
  }
  if (href.indexOf("javascript:") === 0) return false;
  return href;
};

MdRenderer.prototype.image = function(href, title, text) {
  return (
    '<img src="' +
    this.opts.img_base +
    escape(href) +
    '"' +
    ' alt="' +
    text +
    '"' +
    (title ? ' title="' + title + '"' : "") +
    (this.options.xhtml ? "/>" : ">")
  );
};

function renderEmoji(emoji) {
  var opts = this.renderer.opts;
  return emoji in emojis
    ? '<img src="' +
        opts.emoji_base +
        escape(emoji) +
        '.png"' +
        ' alt=":' +
        escape(emoji) +
        ':"' +
        ' title=":' +
        escape(emoji) +
        ':"' +
        ' class="ssb-emoji" height="16" width="16">'
    : ":" + emoji + ":";
}

module.exports = function makeServe(sbot, config) {
  var conf = config.viewer || {};

  var base = conf.base || "/";
  var defaultOpts = {
    base: base,
    msg_base: conf.msg_base || base,
    feed_base: conf.feed_base || base,
    blob_base: conf.blob_base || base,
    img_base: conf.img_base || base,
    emoji_base: conf.emoji_base || base + "emoji/"
  };

  var getMsg = memo({ cache: lru(100) }, getMsgWithValue, sbot);
  var getAbout = memo({ cache: lru(100) }, require("./about"), sbot);

  return function serve(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond(res, 405, "Method must be GET or HEAD");
    }
    req.url = '/' + req.url.split(conf.base)[1];

    var m = urlIdRegex.exec(req.url);

    if (req.url.startsWith("/user-feed/")) return serveUserFeed(req, res, m[4]);
    else if (req.url.startsWith("/channel/"))
      return serveChannel(req, res, m[4]);

    if (m[2] && m[2].length === 3) {
      m[1] = decodeURIComponent(m[1]);
      m[2] = m[1][0];
    }
    switch (m[2]) {
      case "%":
        return serveId(req, res, m[1], m[3], m[5]);
      case "@":
        return serveFeed(req, res, m[1], m[3], m[5]);
      case "&":
        return serveBlob(req, res, sbot, m[1]);
      default:
        return servePath(req, res, m[4]);
    }
  };

  function serveFeed(req, res, feedId) {
    debug("serving feed: " + feedId);

    var opts = defaultOpts;

    opts.marked = {
      gfm: true,
      mentions: true,
      tables: true,
      breaks: true,
      pedantic: false,
      sanitize: true,
      smartLists: true,
      smartypants: false,
      emoji: renderEmoji,
      renderer: new MdRenderer(opts)
    };

    pull(
      sbot.createUserStream({ id: feedId, reverse: true }),
      pull.collect(function(err, logs) {
        if (err) return respond(res, 500, err.stack || err);
        res.writeHead(200, {
          "Content-Type": ctype("html")
        });
        pull(
          pull.values(logs),
          paramap(addAuthorAbout, 8),
          paramap(addFollowAbout, 8),
          paramap(addVoteMessage, 8),
          pull(renderThread(opts), wrapPage(feedId)),
          toPull(res, function(err) {
            if (err) debug("ERROR %O", err);
          })
        );
      })
    );
  }

  function serveUserFeed(req, res, url) {
    var feedId = url.substring(url.lastIndexOf("user-feed/") + 10, 100);
    debug("serving user feed: " + feedId);

    var following = [];
    var channelSubscriptions = [];

    pull(
      sbot.createUserStream({ id: feedId }),
      pull.filter(msg => {
        return (
          !msg.value ||
          msg.value.content.type == "contact" ||
          (msg.value.content.type == "channel" &&
            typeof msg.value.content.subscribed != "undefined")
        );
      }),
      pull.collect(function(err, msgs) {
        msgs.forEach(msg => {
          if (msg.value.content.type == "contact") {
            if (msg.value.content.following)
              following[msg.value.content.contact] = 1;
            else delete following[msg.value.content.contact];
          } else {
            // channel subscription
            if (msg.value.content.subscribed)
              channelSubscriptions[msg.value.content.channel] = 1;
            else delete following[msg.value.content.channel];
          }
        });

        serveFeeds(req, res, following, channelSubscriptions, feedId);
      })
    );
  }

  function serveFeeds(req, res, following, channelSubscriptions, feedId) {
    var opts = defaultOpts;

    opts.marked = {
      gfm: true,
      mentions: true,
      tables: true,
      breaks: true,
      pedantic: false,
      sanitize: true,
      smartLists: true,
      smartypants: false,
      emoji: renderEmoji,
      renderer: new MdRenderer(opts)
    };

    pull(
      sbot.createLogStream({ reverse: true, limit: 2500 }),
      pull.filter(msg => {
        return (
          !msg.value ||
          (msg.value.author in following ||
            msg.value.content.channel in channelSubscriptions)
        );
      }),
      pull.take(100),
      pull.collect(function(err, logs) {
        if (err) return respond(res, 500, err.stack || err);
        res.writeHead(200, {
          "Content-Type": ctype("html")
        });
        pull(
          pull.values(logs),
          paramap(addAuthorAbout, 8),
          paramap(addFollowAbout, 8),
          paramap(addVoteMessage, 8),
          pull(renderThread(opts), wrapPage(feedId)),
          toPull(res, function(err) {
            if (err) debug("ERROR %O", err);
          })
        );
      })
    );
  }

  function serveChannel(req, res, url) {
    var channelId = url.substring(url.lastIndexOf("channel/") + 8, 100);
    debug("serving channel: " + channelId);

    var opts = defaultOpts;

    opts.marked = {
      gfm: true,
      mentions: true,
      tables: true,
      breaks: true,
      pedantic: false,
      sanitize: true,
      smartLists: true,
      smartypants: false,
      emoji: renderEmoji,
      renderer: new MdRenderer(opts)
    };

    pull(
      sbot.query.read({
        limit: 500,
        reverse: true,
        query: [{ $filter: { value: { content: { channel: channelId } } } }]
      }),
      pull.collect(function(err, logs) {
        if (err) return respond(res, 500, err.stack || err);
        res.writeHead(200, {
          "Content-Type": ctype("html")
        });
        pull(
          pull.values(logs),
          paramap(addAuthorAbout, 8),
          paramap(addVoteMessage, 8),
          pull(renderThread(opts), wrapPage(channelId)),
          toPull(res, function(err) {
            if (err) debug("ERROR %O", err);
          })
        );
      })
    );
  }

  function addFollowAbout(msg, cb) {
    if (msg.value.content.contact)
      getAbout(msg.value.content.contact, function(err, about) {
        if (err) return cb(err);
        msg.value.content.contactAbout = about;
        cb(null, msg);
      });
    else cb(null, msg);
  }

  function addVoteMessage(msg, cb) {
    if (
      msg.value.content.type == "vote" &&
      msg.value.content.vote.link[0] == "%"
    )
      getMsg(msg.value.content.vote.link, function(err, linkedMsg) {
        if (err) return cb(err);
        msg.value.content.vote.linkedText = linkedMsg.value.content.text;
        cb(null, msg);
      });
    else cb(null, msg);
  }

  function serveId(req, res, id, ext, query) {
    var q = query ? qs.parse(query) : {};
    var includeRoot = !("noroot" in q);
    var base = q.base || conf.base;
    var baseToken;
    if (!base) {
      if (ext === "js") base = baseToken = "__BASE_" + Math.random() + "_";
      else base = "/";
    }
    var opts = {
      base: base,
      base_token: baseToken,
      msg_base: q.msg_base || conf.msg_base || base,
      feed_base: q.feed_base || conf.feed_base || base,
      blob_base: q.blob_base || conf.blob_base || base,
      img_base: q.img_base || conf.img_base || base,
      emoji_base: q.emoji_base || conf.emoji_base || base + "emoji/"
    };
    opts.marked = {
      gfm: true,
      mentions: true,
      tables: true,
      breaks: true,
      pedantic: false,
      sanitize: true,
      smartLists: true,
      smartypants: false,
      emoji: renderEmoji,
      renderer: new MdRenderer(opts)
    };

    var format = formatMsgs(id, ext, opts);
    if (format === null) return respond(res, 415, "Invalid format");

    pull(
      sbot.links({ dest: id, values: true, rel: "root" }),
      includeRoot && prepend(getMsg, id),
      pull.unique("key"),
      pull.collect(function(err, links) {
        if (err) return respond(res, 500, err.stack || err);
        var etag = hash(sort.heads(links).concat(appHash, ext, qs));
        if (req.headers["if-none-match"] === etag) return respond(res, 304);
        res.writeHead(200, {
          "Content-Type": ctype(ext),
          etag: etag
        });
        pull(
          pull.values(sort(links)),
          paramap(addAuthorAbout, 8),
          format,
          toPull(res, function(err) {
            if (err) debug("ERROR %O", err);
          })
        );
      })
    );
  }

  function addAuthorAbout(msg, cb) {
    getAbout(msg.value.author, function(err, about) {
      if (err) return cb(err);
      msg.author = about;
      cb(null, msg);
    });
  }
};

function serveBlob(req, res, sbot, id) {
  if (req.headers["if-none-match"] === id) return respond(res, 304);
  sbot.blobs.has(id, function(err, has) {
    if (err) {
      if (/^invalid/.test(err.message)) return respond(res, 400, err.message);
      else return respond(res, 500, err.message || err);
    }
    if (!has) return respond(res, 404, "Not found");
    res.writeHead(200, {
      "Cache-Control": "public, max-age=315360000",
      etag: id
    });
    pull(
      sbot.blobs.get(id),
      toPull(res, function(err) {
        if (err) debug("ERROR %O", err);
      })
    );
  });
}

function getMsgWithValue(sbot, id, cb) {
  sbot.get(id, function(err, value) {
    if (err) return cb(err);
    cb(null, { key: id, value: value });
  });
}

function escape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function respond(res, status, message) {
  res.writeHead(status);
  res.end(message);
}

function ctype(name) {
  switch ((name && /[^.\/]*$/.exec(name)[0]) || "html") {
    case "html":
      return "text/html";
    case "js":
      return "text/javascript";
    case "css":
      return "text/css";
    case "json":
      return "application/json";
  }
}

function servePath(req, res, url) {
  switch (url) {
    case "/robots.txt":
      return res.end("User-agent: *");
  }
  var m = /^(\/?[^\/]*)(\/.*)?$/.exec(url);
  switch (m[1]) {
    case "/static":
      return serveStatic(req, res, m[2]);
    case "/emoji":
      return serveEmoji(req, res, m[2]);
  }
  return respond(res, 404, "Not found");
}

function ifModified(req, lastMod) {
  var ifModSince = req.headers["if-modified-since"];
  if (!ifModSince) return false;
  var d = new Date(ifModSince);
  return d && Math.floor(d / 1000) >= Math.floor(lastMod / 1000);
}

function serveStatic(req, res, file) {
  serveFile(req, res, path.join(__dirname, "static", file));
}

function serveFile(req, res, file) {
  fs.stat(file, function(err, stat) {
    if (err && err.code === "ENOENT") return respond(res, 404, "Not found");
    if (err) return respond(res, 500, err.stack || err);
    if (!stat.isFile()) return respond(res, 403, "May only load files");
    if (ifModified(req, stat.mtime)) return respond(res, 304, "Not modified");
    res.writeHead(200, {
      "Content-Type": ctype(file),
      "Content-Length": stat.size,
      "Last-Modified": stat.mtime.toGMTString()
    });
    fs.createReadStream(file).pipe(res);
  });
}

function prepend(fn, arg) {
  return function(read) {
    return function(abort, cb) {
      if (fn && !abort) {
        var _fn = fn;
        fn = null;
        return _fn(arg, function(err, value) {
          if (err)
            return read(err, function(err) {
              cb(err || true);
            });
          cb(null, value);
        });
      }
      read(abort, cb);
    };
  };
}

function formatMsgs(id, ext, opts) {
  switch (ext || "html") {
    case "html":
      return pull(renderThread(opts), wrapPage(id));
    case "js":
      return pull(renderThread(opts), wrapJSEmbed(opts));
    case "json":
      return wrapJSON();
    default:
      return null;
  }
}

function wrap(before, after) {
  return function(read) {
    return cat([pull.once(before), read, pull.once(after)]);
  };
}

function renderThread(opts) {
  return pull(
    pull.map(renderMsg.bind(this, opts)),
    wrap('<div class="ssb-thread">', "</div>")
  );
}

function wrapPage(id) {
  return wrap(
    "<!doctype html><html><head>" +
      "<meta charset=utf-8>" +
      "<title>Scuttlebutt content: " +
      id +
      "</title>" +
      '<meta name=viewport content="width=device-width,initial-scale=1">' +
      '<link rel=stylesheet href="/static/base.css">' +
      '<link rel=stylesheet href="/static/nicer.css">' +
      "</head><body>",
    "</body></html>"
  );
}

function wrapJSON() {
  var first = true;
  return pull(pull.map(JSON.stringify), join(","), wrap("[", "]"));
}

function wrapJSEmbed(opts) {
  return pull(
    wrap('<link rel=stylesheet href="' + opts.base + 'static/base.css">', ""),
    pull.map(docWrite),
    opts.base_token && rewriteBase(new RegExp(opts.base_token, "g"))
  );
}

function rewriteBase(token) {
  // detect the origin of the script and rewrite the js/html to use it
  return pull(
    replace(token, '" + SSB_VIEWER_ORIGIN + "/'),
    wrap(
      "var SSB_VIEWER_ORIGIN = (function () {" +
        'var scripts = document.getElementsByTagName("script")\n' +
        "var script = scripts[scripts.length-1]\n" +
        "if (!script) return location.origin\n" +
        'return script.src.replace(/\\/%.*$/, "")\n' +
        "}())\n",
      ""
    )
  );
}

function join(delim) {
  var first = true;
  return pull.map(function(val) {
    if (!first) return delim + String(val);
    first = false;
    return val;
  });
}

function replace(re, rep) {
  return pull.map(function(val) {
    return String(val).replace(re, rep);
  });
}

function docWrite(str) {
  return "document.write(" + JSON.stringify(str) + ")\n";
}

function hash(arr) {
  return arr
    .reduce(function(hash, item) {
      return hash.update(String(item));
    }, crypto.createHash("sha256"))
    .digest("base64");
}

function renderMsg(opts, msg) {
  var c = msg.value.content || {};
  var name = encodeURIComponent(msg.key);
  return (
    '<div class="ssb-message" id="' +
    name +
    '">' +
    '<img class="ssb-avatar-image" alt=""' +
    ' src="' +
    opts.img_base +
    escape(msg.author.image) +
    '"' +
    ' height="32" width="32">' +
    '<a class="ssb-avatar-name"' +
    ' href="/' +
    escape(msg.value.author) +
    '"' +
    ">" +
    msg.author.name +
    "</a>" +
    msgTimestamp(msg, name) +
    render(opts, c) +
    "</div>"
  );
}

function msgTimestamp(msg, name) {
  var date = new Date(msg.value.timestamp);
  return (
    '<time class="ssb-timestamp" datetime="' +
    date.toISOString() +
    '">' +
    '<a href="#' +
    name +
    '">' +
    formatDate(date) +
    "</a></time>"
  );
}

function formatDate(date) {
  // return date.toISOString().replace('T', ' ')
  return htime(date);
}

function render(opts, c) {
  if (c.type === "post") {
    var channel = c.channel
      ? ' in <a href="/view/channel/' + c.channel + '">#' + c.channel + "</a>"
      : "";
    return channel + renderPost(opts, c);
  } else if (c.type == "vote" && c.vote.expression == "Dig") {
    var channel = c.channel
      ? ' in <a href="/view/channel/' + c.channel + '">#' + c.channel + "</a>"
      : "";
    var linkedText = "this";
    if (typeof c.vote.linkedText != "undefined")
      linkedText = c.vote.linkedText.substring(0, 75);
    return (
      " dug " +
      '<a href="/view/' +
      c.vote.link +
      '">' +
      linkedText +
      "</a>" +
      channel
    );
  } else if (c.type == "vote") {
    var linkedText = "this";
    if (typeof c.vote.linkedText != "undefined")
      linkedText = c.vote.linkedText.substring(0, 75);
    return ' voted <a href="/view/' + c.vote.link + '">' + linkedText + "</a>";
  } else if (c.type == "contact" && c.following) {
    var name = c.contact;
    if (typeof c.contactAbout != "undefined") name = c.contactAbout.name;
    return ' followed <a href="/view/' + c.contact + '">' + name + "</a>";
  } else if (c.type == "contact" && !c.following) {
    var name = c.contact;
    if (typeof c.contactAbout != "undefined") name = c.contactAbout.name;
    return ' unfollowed <a href="/view/' + c.contact + '">' + name + "</a>";
  } else if (typeof c == "string") return " wrote something private ";
  else if (c.type == "about") return " changed something in about";
  else if (c.type == "issue") return " created an issue";
  else if (c.type == "git-update") return " did a git update";
  else if (c.type == "ssb-dns") return " updated dns";
  else if (c.type == "pub") return " connected to a pub";
  else if (c.type == "channel" && c.subscribed)
    return (
      ' subscribed to channel <a href="/view/channel/' +
      c.channel +
      '">#' +
      c.channel +
      "</a>"
    );
  else if (c.type == "channel" && !c.subscribed)
    return (
      ' unsubscribed from channel <a href="/view/channel/' +
      c.channel +
      '">#' +
      c.channel +
      "</a>"
    );
  else return renderDefault(c);
}

function renderPost(opts, c) {
  return '<div class="ssb-post">' + marked(c.text, opts.marked) + "</div>";
}

function renderDefault(c) {
  return "<pre>" + JSON.stringify(c, 0, 2) + "</pre>";
}
