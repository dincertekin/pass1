// Opens Paddle's checkout for the transaction in the URL (?_ptxn=txn_…), which pass1's server
// created. When it's done, or closed, the browser goes back to pass1.
// Docs: https://developer.paddle.com/paddlejs/overview

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? "";
const appUrl = meta("app-url");
const status = document.getElementById("status");
document.getElementById("back").href = `${appUrl}/vault`;

if (!window.Paddle || !meta("paddle-client-token")) {
  status.textContent = "Checkout couldn't load. Go back to pass1 and try again in a moment.";
} else {
  if (meta("paddle-environment") === "sandbox") window.Paddle.Environment.set("sandbox");
  window.Paddle.Initialize({
    token: meta("paddle-client-token"),
    checkout: { settings: { displayMode: "overlay", successUrl: `${appUrl}/vault` } },
    eventCallback(event) {
      if (event.name === "checkout.closed") window.location.assign(`${appUrl}/vault`);
    },
  });
  // With _ptxn in the URL, Paddle.js opens that transaction's checkout by itself.
  if (!new URLSearchParams(window.location.search).has("_ptxn")) {
    status.textContent = "There's no checkout to open here. Choose a plan in pass1 first.";
  }
}
