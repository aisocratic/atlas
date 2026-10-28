import assert from "node:assert/strict";
import { test } from "node:test";
import { cardHref, readCardParam } from "../../lib/dashboard/card-url";

test("reads the full-screen card from the query, through a canonical id when given", () => {
  assert.equal(readCardParam("?dashboard=abc&card=releases"), "releases");
  assert.equal(readCardParam("?card=%20"), null);
  assert.equal(readCardParam(""), null);
  assert.equal(readCardParam("?card=performance", id => (id === "performance" ? "web-vitals" : id)), "web-vitals");
});

test("sets and drops ?card= without touching other parameters or the hash", () => {
  const location = { pathname: "/demo/", search: "?dashboard=abc", hash: "#workspace" };
  assert.equal(cardHref(location, "releases"), "/demo/?dashboard=abc&card=releases#workspace");
  assert.equal(cardHref({ ...location, search: "?dashboard=abc&card=releases" }, "turns"), "/demo/?dashboard=abc&card=turns#workspace");
  assert.equal(cardHref({ pathname: "/", search: "?card=releases" }, null), "/");
});
