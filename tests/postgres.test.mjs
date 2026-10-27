import test from "node:test";
import assert from "node:assert/strict";

import { parameterizedSql } from "../lib/postgres.js";

test("PostgreSQL template values become positional parameters", () => {
  const strings = ["SELECT * FROM portal_users WHERE id=", " AND email=", ""];
  strings.raw = [...strings];

  assert.deepEqual(parameterizedSql(strings, [7, "client@example.test"]), {
    text: "SELECT * FROM portal_users WHERE id=$1 AND email=$2",
    values: [7, "client@example.test"],
  });
});

test("PostgreSQL helper rejects untagged query strings", () => {
  assert.throws(
    () => parameterizedSql("SELECT * FROM portal_users", []),
    /tagged template/,
  );
});
