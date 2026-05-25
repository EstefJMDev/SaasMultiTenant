"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const errors = [];

if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  errors.push("Root package.json must not define dependencies.");
}

if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
  errors.push("Root package.json must not define devDependencies.");
}

if (pkg.workspaces) {
  errors.push("Root package.json must not define workspaces in this repository.");
}

if (errors.length > 0) {
  console.error("Root Node boundary check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Root Node boundary check passed.");
