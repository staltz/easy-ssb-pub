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
    wrap(
      '<span class="top-tip">You are reading content from ' +
        '<a href="https://www.scuttlebutt.nz">Scuttlebutt</a>' +
      '</span>' +
      '<main>',

      '</main>' +
      '<a class="call-to-action" href="https://www.scuttlebutt.nz">' +
        'Join Scuttlebutt now' +
      '</a>'
    )
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
      styles +
      "</head><body>",
    "</body></html>"
  );
}

var styles = `
  <style>
    html { background-color: #f1f3f5; }
    body {
      color: #212529;
      font-family: "Helvetica Neue", "Calibri Light", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      letter-spacing: 0.02em;
      padding-top: 30px;
      padding-bottom: 50px;
    }
    a { color: #364fc7; }

    .top-tip, .top-tip a {
      color: #868e96;
    }
    .top-tip {
      text-align: center;
      display: block;
      margin-bottom: 10px;
      font-size: 14px;
    }
    main { margin: 0 auto; max-width: 40rem; }
    main article:first-child { border-radius: 3px 3px 0 0; }
    main article:last-child { border-radius: 0 0 3px 3px; }
    article {
      background-color: white;
      padding: 20px;
      box-shadow: 0 1px 3px #949494;
      position: relative;
    }
    .top-right { position: absolute; top: 20px; right: 20px; }
    article > header { margin-bottom: 20px; }
    article > header > figure {
      margin: 0; display: flex;
    }
    article > header > figure > img {
      border-radius: 2px; margin-right: 10px;
    }
    article > header > figure > figcaption {
      display: flex; flex-direction: column; justify-content: space-around;
    }
    .ssb-avatar-name { font-size: 1.2em; font-weight: bold; }
    time a { color: #868e96; }
    .ssb-avatar-name, time a {
      text-decoration: none;
    }
    .ssb-avatar-name:hover, time:hover a {
      text-decoration: underline;
    }
    section p { line-height: 1.45em; }
    section p img {
      max-width: 100%;
      max-height: 50vh;
      margin: 0 auto;
    }
    .status {
      font-style: italic;
    }

    code {
      display: inline;
      padding: 2px 5px;
      font-weight: 600;
      background-color: #e9ecef;
      border-radius: 3px;
      color: #495057;
    }
    blockquote {
      padding-left: 1.2em;
      margin: 0;
      color: #868e96;
      border-left: 5px solid #ced4da;
    }
    pre {
      background-color: #212529;
      color: #ced4da;
      font-weight: bold;
      padding: 5px;
      border-radius: 3px;
      position: relative;
    }
    pre::before {
      content: "METADATA";
      position: absolute;
      top: -7px;
      left: 0px;
      background-color: #212529;
      padding: 2px 4px 0;
      border-radius: 2px;
      font-family: "Helvetica Neue", "Calibri Light", Roboto, sans-serif;
      font-size: 9px;
    }
    .call-to-action {
      display: block;
      margin: 0 auto;
      width: 13em;
      text-align: center;
      text-decoration: none;
      margin-top: 20px;
      margin-bottom: 60px;
      background-color: #5c7cfa;
      padding: 15px 0;
      color: #edf2ff;
      border-radius: 3px;
      border-bottom: 3px solid #3b5bdb;
    }
    .call-to-action:hover {
      background-color: #748ffc;
      border-bottom: 3px solid #4c6ef5;
    }
  </style>
`;

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
    '<article id="' +
    name +
    '">' +
      '<header>' +
        '<figure>' +
          '<img alt="" ' +
            'src="' + opts.img_base + escape(msg.author.image) + '" ' +
            'height="50" width="50">' +
          '<figcaption>' +
            '<a class="ssb-avatar-name"' +
            ' href="' + opts.base +
            escape(msg.value.author) +
            '"' +
            ">" + msg.author.name + "</a>" +
            msgTimestamp(msg, name) +
          '</figcaption>' +
        '</figure>' +
      '</header>' +
      render(opts, c) +
    "</article>"
  );
}

function msgTimestamp(msg, name) {
  var date = new Date(msg.value.timestamp);
  var isoStr = date.toISOString();
  return (
    '<time class="ssb-timestamp" datetime="' + isoStr + '">' +
      '<a ' +
      'href="#' + name + '" ' +
      'title="' + isoStr + '" ' +
      '>' + formatDate(date) + '</a>' +
    '</time>'
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
      ? '<div class="top-right"><a href="' + base + 'channel/' + c.channel + '">#' + c.channel + "</a></div>"
      : "";
    return channel + renderPost(opts, c);
  } else if (c.type == "vote" && c.vote.expression == "Dig") {
    var channel = c.channel
      ? ' in <a href="' + base + 'channel/' + c.channel + '">#' + c.channel + "</a>"
      : "";
    var linkedText = "this";
    if (typeof c.vote.linkedText != "undefined")
      linkedText = c.vote.linkedText.substring(0, 75);
    return ('<span class="status">' +
      'Liked ' +
      '<a href="' + base +
      c.vote.link +
      '">' +
      linkedText +
      "</a>" +
      channel +
      '</span>'
    );
  } else if (c.type == "vote") {
    var linkedText = "this";
    if (typeof c.vote.linkedText != "undefined")
      linkedText = c.vote.linkedText.substring(0, 75);
    return '<span class="status">' +
      'Voted <a href="' + base + c.vote.link + '">' + linkedText + "</a>" +
      '</span>';
  } else if (c.type == "contact" && c.following) {
    var name = c.contact;
    if (typeof c.contactAbout != "undefined") name = c.contactAbout.name;
    return '<span class="status">' +
      'Followed <a href="' + base + c.contact + '">' + name + "</a>" +
      '</span>';
  } else if (c.type == "contact" && !c.following) {
    var name = c.contact;
    if (typeof c.contactAbout != "undefined") name = c.contactAbout.name;
    return '<span class="status">' +
      'Unfollowed <a href="' + base + c.contact + '">' + name + "</a>" +
      '</span>';
  } else if (typeof c == "string") {
    return '<span class="status">' +
      "Wrote something private" +
      '</span>';
  }
  else if (c.type == "about") {
    return '<span class="status">' +
      "Changed something in about" +
      '</span>' +
      renderDefault(c);
  }
  else if (c.type == "issue") {
    return '<span class="status">' +
      "Created a git issue" +
      '</span>' +
      renderDefault(c);
  }
  else if (c.type == "git-update") {
    return '<span class="status">' +
      "Did a git update" +
      '</span>' +
      renderDefault(c);
  }
  else if (c.type == "ssb-dns") {
    return '<span class="status">' +
      "Updated DNS" +
      '</span>' +
      renderDefault(c);
  }
  else if (c.type == "pub") {
    return '<span class="status">' +
      "Connected to a pub" +
      '</span>' +
      renderDefault(c);
  }
  else if (c.type == "channel" && c.subscribed)
    return '<span class="status">' +
      'Subscribed to channel <a href="' + base + 'channel/' +
      c.channel +
      '">#' +
      c.channel +
      "</a>" +
      '</span>';
  else if (c.type == "channel" && !c.subscribed)
    return '<span class="status">' +
      'Unsubscribed from channel <a href="' + base + 'channel/' +
      c.channel +
      '">#' +
      c.channel +
      "</a>" +
      '</span>';
  else return renderDefault(c);
}

function renderPost(opts, c) {
  return '<section>' + marked(c.text, opts.marked) + "</section>";
}

function renderDefault(c) {
  return "<pre>" + JSON.stringify(c, 0, 2) + "</pre>";
}