// Opt-out for recipients of Reviewcap's one-time outreach emails.
//
//   GET  /optout?d=<shop>.myshopify.com&t=<token>  -> confirmation page, changes nothing
//   POST /optout  (d, t from the form)             -> unsubscribes, shows the result
//
// Unsubscribing only on POST is the point of this file. Corporate mail
// gateways (Microsoft Safe Links, Proofpoint, Mimecast) fetch links in incoming
// mail with GET before anyone clicks; when GET itself unsubscribed, a scanner
// could opt out a merchant who never saw the email. Scanners don't submit forms.
//
// The token check and the sheet update happen in a Google Apps Script web app
// (legal/optout-webapp.gs in the private reviewcap-leads repo). This function
// holds no secret: the token is an HMAC the script verifies, and the script URL
// below appears in every link anyway.
//
// Reads query and body itself instead of relying on Vercel's request helpers,
// so it also runs behind a plain node:http server for local testing.

// Overridable only so local tests can point at a stub instead of the live sheet.
const SCRIPT_URL = process.env.OPTOUT_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbyny9hcqIdGJXRBeC5uPXWwDXLo_QjSos4heitMNXOJIwnu_geMWUzjcJtDbhu2D8ba/exec";
const CONTACT = "patrick@tryreviewcap.com";
const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const TOKEN_RE = /^[0-9a-f]{16}$/;
const TIMEOUT_MS = 10000;

module.exports = async function handler(req, res) {
  let params;
  if (req.method === "GET" || req.method === "HEAD") {
    params = new URL(req.url, "http://localhost").searchParams;
  } else if (req.method === "POST") {
    params = await formParams(req);
  } else {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, page("Method not allowed", "<p>Please use the link in the email.</p>"));
  }

  const d = String(params.get("d") || "").trim().toLowerCase();
  const t = String(params.get("t") || "").trim();
  if (!DOMAIN_RE.test(d) || !TOKEN_RE.test(t)) {
    return send(res, 400, invalidPage());
  }

  if (req.method === "POST") {
    const result = await callScript("POST", { d, t });
    if (result === "opted_out" || result === "not_found") {
      // not_found: valid token, but the store's row is already gone. Either
      // way nothing is left to contact them with.
      return send(res, 200, donePage(d));
    }
    if (result === "invalid") return send(res, 400, invalidPage());
    return send(res, 502, errorPage());
  }

  const check = await callScript("GET", { mode: "check", d, t });
  if (check === "valid") return send(res, 200, confirmPage(d, t));
  if (check === "invalid") return send(res, 400, invalidPage());
  return send(res, 502, errorPage());
};

// Returns the script's `result` string, or "error" on any transport problem.
async function callScript(method, fields) {
  const body = new URLSearchParams(fields).toString();
  const url = method === "GET" ? `${SCRIPT_URL}?${body}` : SCRIPT_URL;
  try {
    const r = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
      body: method === "POST" ? body : undefined,
      // Apps Script answers with a 302 to script.googleusercontent.com; fetch
      // follows it (as GET, which is what the echo URL expects).
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return "error";
    const data = await r.json();
    return typeof data.result === "string" ? data.result : "error";
  } catch (e) {
    console.error("optout: Apps Script call failed:", e && e.message);
    return "error";
  }
}

async function formParams(req) {
  if (req.body && typeof req.body === "object") return new URLSearchParams(req.body);
  if (typeof req.body === "string") return new URLSearchParams(req.body);
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) break; // two short fields; anything bigger is not ours
  }
  return new URLSearchParams(raw);
}

function send(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // The token is in the URL; don't hand it to anyone via Referer.
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(html);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function confirmPage(d, t) {
  return page(
    "Unsubscribe from Reviewcap emails",
    `<p>Click the button below and Reviewcap won't email <strong>${esc(d)}</strong> again.</p>
     <form method="post" action="/optout">
       <input type="hidden" name="d" value="${esc(d)}">
       <input type="hidden" name="t" value="${esc(t)}">
       <button type="submit">Unsubscribe</button>
     </form>
     <p class="muted">Changed your mind? Just close this page.</p>`
  );
}

function donePage(d) {
  return page(
    "You're unsubscribed",
    `<p>Reviewcap won't contact <strong>${esc(d)}</strong> again. We've also deleted the contact details we had stored for your store.</p>
     <p class="muted">Questions? Write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`
  );
}

function invalidPage() {
  return page(
    "This link doesn't work",
    `<p>The unsubscribe link is incomplete or invalid. Please use the exact link from the email, or simply reply to the email with “unsubscribe”.</p>
     <p class="muted">You can also write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`
  );
}

function errorPage() {
  return page(
    "Something went wrong",
    `<p>We couldn't process your request just now. Please try again in a few minutes, or reply to the email with “unsubscribe” and we'll take care of it.</p>
     <p class="muted">You can also write to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`
  );
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} — Reviewcap</title>
<style>
  *{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#33454F;background:#F7F9FB;-webkit-font-smoothing:antialiased;}
  main{max-width:480px;margin:0 auto;padding:clamp(40px,10vh,96px) 16px;}
  .card{background:#fff;border:1px solid #E6ECF1;border-radius:14px;padding:32px 28px;}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:24px;font-weight:800;font-size:18px;color:#13222E;letter-spacing:-0.02em;}
  h1{font-size:24px;line-height:1.25;letter-spacing:-0.02em;color:#11212E;margin:0 0 14px;}
  p{font-size:16px;line-height:1.6;color:#4A5B66;margin:0 0 16px;}
  strong{color:#13222E;word-break:break-all;}
  .muted{font-size:14px;color:#7A8893;margin:16px 0 0;}
  a{color:#185FA5;font-weight:600;}
  button{font:inherit;font-weight:700;font-size:16px;color:#fff;background:#185FA5;border:0;border-radius:10px;padding:12px 22px;cursor:pointer;}
  button:hover{background:#134F8A;}
</style>
</head>
<body>
<main>
  <div class="card">
    <div class="brand">
      <svg width="30" height="21" viewBox="0 0 64 44" fill="none" aria-hidden="true">
        <path d="M11 30 C11 14 22 9 33 9 C45 9 49 19 49 30 Z" fill="#0F6E56"/>
        <rect x="10" y="28.5" width="40" height="3" rx="1.5" fill="#0A4B39"/>
        <path d="M44 31.5 C54 31.5 62 33.5 63 36.5 C62.2 38 56 37 48.5 35.8 C45 35.2 44 33.5 44 31.5 Z" fill="#0A4B39"/>
        <circle cx="33" cy="9" r="2.6" fill="#0A4B39"/>
      </svg>
      Reviewcap
    </div>
    <h1>${esc(title)}</h1>
    ${body}
  </div>
</main>
</body>
</html>`;
}
