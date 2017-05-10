var path = require('path');
var pull = require("pull-stream");
var marked = require("ssb-marked");
var htime = require("human-time");
var emojis = require("emoji-named-characters");
var cat = require("pull-cat");

var emojiDir = path.join(require.resolve("emoji-named-characters"), "../pngs");

exports.wrapPage = wrapPage;
exports.MdRenderer = MdRenderer;
exports.renderEmoji = renderEmoji;
exports.formatMsgs = formatMsgs;
exports.renderThread = renderThread;

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

function escape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    ' href="' + opts.base +
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
  var base = opts.base;
  if (c.type === "post") {
    var channel = c.channel
      ? ' in <a href="' + base + 'channel/' + c.channel + '">#' + c.channel + "</a>"
      : "";
    return channel + renderPost(opts, c);
  } else if (c.type == "vote" && c.vote.expression == "Dig") {
    var channel = c.channel
      ? ' in <a href="' + base + 'channel/' + c.channel + '">#' + c.channel + "</a>"
      : "";
    var linkedText = "this";
    if (typeof c.vote.linkedText != "undefined")
      linkedText = c.vote.linkedText.substring(0, 75);
    return (
      " liked " +
      '<a href="' + base +
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
    return ' voted <a href="' + base + c.vote.link + '">' + linkedText + "</a>";
  } else if (c.type == "contact" && c.following) {
    var name = c.contact;
    if (typeof c.contactAbout != "undefined") name = c.contactAbout.name;
    return ' followed <a href="' + base + c.contact + '">' + name + "</a>";
  } else if (c.type == "contact" && !c.following) {
    var name = c.contact;
    if (typeof c.contactAbout != "undefined") name = c.contactAbout.name;
    return ' unfollowed <a href="' + base + c.contact + '">' + name + "</a>";
  } else if (typeof c == "string") return " wrote something private ";
  else if (c.type == "about") return " changed something in about";
  else if (c.type == "issue") return " created an issue";
  else if (c.type == "git-update") return " did a git update";
  else if (c.type == "ssb-dns") return " updated dns";
  else if (c.type == "pub") return " connected to a pub";
  else if (c.type == "channel" && c.subscribed)
    return (
      ' subscribed to channel <a href="' + base + 'channel/' +
      c.channel +
      '">#' +
      c.channel +
      "</a>"
    );
  else if (c.type == "channel" && !c.subscribed)
    return (
      ' unsubscribed from channel <a href="' + base + 'channel/' +
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