import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { ImportFileError, itemsFromBitwardenJson, itemsFromCsv, itemsFromFile } from "./import-file";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and line breaks inside fields", () => {
    const csv = 'name,note\r\n"Bank, main","Line one\nLine ""two"""\r\n';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Bank, main", 'Line one\nLine "two"'],
    ]);
  });

  it("ignores a byte-order mark and blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps an empty last field", () => {
    expect(parseCsv("a,b\n1,")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });
});

describe("itemsFromCsv", () => {
  it("reads a Chrome export", () => {
    const csv = "name,url,username,password,note\ngithub.com,https://github.com/login,ada-dev,gh-secret,Recovery codes in safe\n";
    expect(itemsFromCsv(csv)).toEqual([
      { name: "github.com", url: "https://github.com/login", username: "ada-dev", password: "gh-secret", notes: "Recovery codes in safe" },
    ]);
  });

  it("reads a 1Password export, case-insensitive headers", () => {
    const csv = "Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nNetflix,netflix.com,ada@example.com,nf-secret,,true,false,,Family\n";
    expect(itemsFromCsv(csv)).toEqual([
      { name: "Netflix", url: "netflix.com", username: "ada@example.com", password: "nf-secret", notes: "Family", favorite: true },
    ]);
  });

  it("reads a Bitwarden CSV export", () => {
    const csv =
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n" +
      ",1,login,Bank,,,0,https://bank.example,1048,bank-secret,\n";
    expect(itemsFromCsv(csv)).toEqual([
      { name: "Bank", url: "https://bank.example", username: "1048", password: "bank-secret", favorite: true },
    ]);
  });

  it("keeps a password's exact spacing", () => {
    expect(itemsFromCsv("name,password\nX,  spaced  \n")[0]?.password).toBe("  spaced  ");
  });

  it("names an item after its website when the name is missing, and skips empty rows", () => {
    const csv = "name,url,password,note\n,https://www.example.org/x,pw,\nNothing,,,\n";
    expect(itemsFromCsv(csv)).toEqual([{ name: "example.org", url: "https://www.example.org/x", password: "pw" }]);
  });

  it("refuses a CSV with no password column", () => {
    expect(() => itemsFromCsv("name,url\nA,b\n")).toThrow(ImportFileError);
  });
});

describe("itemsFromBitwardenJson", () => {
  it("reads logins and secure notes, skipping cards and identities", () => {
    const json = JSON.stringify({
      encrypted: false,
      items: [
        { type: 1, name: "GitHub", favorite: true, notes: null, login: { username: "ada", password: "pw", uris: [{ uri: "https://github.com" }] } },
        { type: 2, name: "Recovery codes", notes: "1234 5678", login: null },
        { type: 3, name: "Visa" },
      ],
    });
    expect(itemsFromBitwardenJson(json)).toEqual([
      { name: "GitHub", url: "https://github.com", username: "ada", password: "pw", favorite: true },
      { name: "Recovery codes", password: "", notes: "1234 5678" },
    ]);
  });

  it("explains what to do with an encrypted export", () => {
    expect(() => itemsFromBitwardenJson('{"encrypted":true,"items":[]}')).toThrow(/unencrypted/);
  });
});

describe("itemsFromFile", () => {
  it("says so when a file has no passwords", () => {
    expect(() => itemsFromFile("empty.csv", "name,password\n")).toThrow("No passwords found in this file.");
  });
});
