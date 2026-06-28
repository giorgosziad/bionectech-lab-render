/**
 * Karam File Delivery — frontend catcher + zip downloader
 * -------------------------------------------------------
 * Works with the Anthropic Messages API (text-only output).
 * Karam emits a ‹‹FILE_DELIVERY›› JSON block; this module parses it,
 * builds a real .zip in the browser with JSZip, and downloads it.
 *
 * Handles BOTH:
 *   - text files  (encoding: "utf8")  -> code, .md, .json, .csv, .html, etc.
 *   - binary files (encoding: "base64") -> images, PDFs, fonts, nested zips, etc.
 *
 * Requires JSZip on the page. Add once in your HTML <head> or before this script:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
 *
 * USAGE:
 *   const cleanText = await KaramFileDelivery.process(rawAssistantText);
 *   // render cleanText in the chat (the FILE_DELIVERY block is stripped out)
 */

(function (global) {
  "use strict";

  var OPEN_TAG = "\u2039\u2039FILE_DELIVERY\u203A\u203A";   // ‹‹FILE_DELIVERY››
  var CLOSE_TAG = "\u2039\u2039/FILE_DELIVERY\u203A\u203A";  // ‹‹/FILE_DELIVERY››

  // Convert a base64 string into a Uint8Array (binary-safe).
  function base64ToBytes(b64) {
    var clean = String(b64).replace(/\s+/g, "");
    var binary = global.atob(clean);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Pull the JSON payload out of the FILE_DELIVERY block, if present.
  function extractPayload(text) {
    if (typeof text !== "string") {
      return null;
    }
    var start = text.indexOf(OPEN_TAG);
    var end = text.indexOf(CLOSE_TAG);
    if (start === -1 || end === -1 || end < start) {
      return null;
    }
    var inner = text.slice(start + OPEN_TAG.length, end).trim();

    // Tolerate a fenced ```json ... ``` wrapper if the model added one.
    inner = inner.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();

    try {
      var parsed = JSON.parse(inner);
      return parsed;
    } catch (err) {
      console.error("[KaramFileDelivery] Could not parse delivery JSON:", err);
      return null;
    }
  }

  // Remove the FILE_DELIVERY block from the text so it isn't shown in chat.
  function stripBlock(text) {
    if (typeof text !== "string") {
      return text;
    }
    var start = text.indexOf(OPEN_TAG);
    var end = text.indexOf(CLOSE_TAG);
    if (start === -1 || end === -1 || end < start) {
      return text;
    }
    var before = text.slice(0, start);
    var after = text.slice(end + CLOSE_TAG.length);
    return (before + after).trim();
  }

  // Trigger a browser download for a Blob.
  function downloadBlob(blob, filename) {
    var url = global.URL.createObjectURL(blob);
    var a = global.document.createElement("a");
    a.href = url;
    a.download = filename || "deliverables.zip";
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    // Give the browser a moment before revoking.
    global.setTimeout(function () {
      global.URL.revokeObjectURL(url);
    }, 1500);
  }

  // Build a zip from the payload and download it.
  function deliver(payload) {
    if (!payload || !Array.isArray(payload.files) || payload.files.length === 0) {
      console.warn("[KaramFileDelivery] No files in payload.");
      return Promise.resolve(false);
    }
    if (typeof global.JSZip === "undefined") {
      console.error("[KaramFileDelivery] JSZip is not loaded. Add the JSZip <script> tag.");
      return Promise.resolve(false);
    }

    var zip = new global.JSZip();

    for (var i = 0; i < payload.files.length; i++) {
      var f = payload.files[i];
      if (!f || !f.path) {
        continue;
      }
      var encoding = (f.encoding || "utf8").toLowerCase();
      if (encoding === "base64") {
        try {
          zip.file(f.path, base64ToBytes(f.content || ""), { binary: true });
        } catch (err) {
          console.error("[KaramFileDelivery] Bad base64 for " + f.path + ":", err);
        }
      } else {
        zip.file(f.path, f.content == null ? "" : String(f.content));
      }
    }

    var archiveName = payload.archive || "deliverables.zip";

    // Single file + no explicit archive name => download the file directly.
    if (payload.files.length === 1 && !payload.archive) {
      var only = payload.files[0];
      var enc = (only.encoding || "utf8").toLowerCase();
      var blob;
      if (enc === "base64") {
        blob = new global.Blob([base64ToBytes(only.content || "")]);
      } else {
        blob = new global.Blob([only.content == null ? "" : String(only.content)], {
          type: "text/plain;charset=utf-8"
        });
      }
      downloadBlob(blob, only.path.split("/").pop());
      return Promise.resolve(true);
    }

    return zip
      .generateAsync({ type: "blob", compression: "DEFLATE" })
      .then(function (blob) {
        downloadBlob(blob, archiveName);
        return true;
      })
      .catch(function (err) {
        console.error("[KaramFileDelivery] Zip generation failed:", err);
        return false;
      });
  }

  // Main entry: scan assistant text, deliver any files, return cleaned text.
  function process(rawText) {
    var payload = extractPayload(rawText);
    if (!payload) {
      return Promise.resolve(rawText);
    }
    return deliver(payload).then(function () {
      return stripBlock(rawText);
    });
  }

  global.KaramFileDelivery = {
    process: process,
    extractPayload: extractPayload,
    stripBlock: stripBlock
  };
})(typeof window !== "undefined" ? window : this);
