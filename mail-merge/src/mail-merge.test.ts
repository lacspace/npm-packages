import { describe, expect, it } from "vitest";
import {
  compileTemplate,
  findVariables,
  isValidEmail,
  merge,
  mergeAll,
  parseCsv,
  parseRows,
  render,
  type Row,
} from "./index";

describe("parseCsv", () => {
  it("parses a simple comma CSV", () => {
    const r = parseCsv("email,name\na@x.com,Ram\nb@x.com,Sita\n");
    expect(r.columns).toEqual(["email", "name"]);
    expect(r.rows).toEqual([
      { email: "a@x.com", name: "Ram" },
      { email: "b@x.com", name: "Sita" },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("handles Excel semicolon export with BOM and CRLF", () => {
    const r = parseCsv("﻿E-mail;First Name;City\r\nram@x.com;Ram;Kathmandu\r\n");
    expect(r.columns).toEqual(["E-mail", "First Name", "City"]);
    expect(r.rows[0]).toEqual({ "E-mail": "ram@x.com", "First Name": "Ram", City: "Kathmandu" });
  });

  it("auto-detects tab delimiter", () => {
    const r = parseCsv("email\tname\na@x.com\tRam");
    expect(r.rows[0]).toEqual({ email: "a@x.com", name: "Ram" });
  });

  it("honours an explicit delimiter", () => {
    const r = parseCsv("a;b,c\n1;2,3", { delimiter: "," });
    expect(r.columns).toEqual(["a;b", "c"]);
  });

  it("keeps quoted commas and doubled quotes", () => {
    const r = parseCsv('email,company\na@x.com,"Acme, Inc. ""Best"""');
    expect(r.rows[0]!.company).toBe('Acme, Inc. "Best"');
  });

  it("keeps embedded newlines inside quotes", () => {
    const r = parseCsv('email,address\na@x.com,"Line 1\nLine 2"\nb@x.com,Short');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!.address).toBe("Line 1\nLine 2");
    expect(r.rows[1]!.email).toBe("b@x.com");
  });

  it("reports ragged rows with their line number but keeps them", () => {
    const r = parseCsv("email,name\na@x.com\nb@x.com,B,extra");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ email: "a@x.com", name: "" });
    expect(r.errors).toEqual([
      { row: 2, message: "Expected 2 fields but found 1" },
      { row: 3, message: "Expected 2 fields but found 3" },
    ]);
  });

  it("skips fully empty rows", () => {
    const r = parseCsv("email,name\n\n,\na@x.com,A\n , \n");
    expect(r.rows).toEqual([{ email: "a@x.com", name: "A" }]);
  });

  it("trims headers and de-duplicates them", () => {
    const r = parseCsv(" email , email ,Email,\n a , b , c ,d");
    expect(r.columns).toEqual(["email", "email_2", "Email_3", "column_4"]);
    expect(r.rows[0]).toEqual({ email: "a", email_2: "b", Email_3: "c", column_4: "d" });
  });

  it("reports an unterminated quote", () => {
    const r = parseCsv('email,name\na@x.com,"Ram');
    expect(r.rows[0]!.name).toBe("Ram");
    expect(r.errors[0]!.message).toMatch(/Unterminated/);
  });

  it("returns empty for empty input", () => {
    expect(parseCsv("")).toEqual({ rows: [], columns: [], errors: [] });
  });

  it("headerAliases renames matching headers", () => {
    const r = parseCsv("Correo,Nombre\na@x.com,Ana", { headerAliases: { email: ["correo"], firstName: ["nombre"] } });
    expect(r.columns).toEqual(["email", "firstName"]);
    const m = merge({ subject: "Hola {{first name}}" }, r.rows);
    expect(m.messages[0]!.subject).toBe("Hola Ana");
  });

  it("parses Nepali/Unicode values", () => {
    const r = parseCsv("email;नाम\nram@x.com;राम बहादुर");
    expect(r.rows[0]!["नाम"]).toBe("राम बहादुर");
  });
});

describe("parseRows", () => {
  it("parses a CSV string like parseCsv", () => {
    expect(parseRows("a,b\n1,2")).toEqual(parseCsv("a,b\n1,2"));
  });

  it("stringifies array values", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    const r = parseRows([
      { email: "a@x.com", n: 5, ok: true, when: d, none: null },
      { email: "b@x.com", extra: undefined, tags: ["a", "b"] },
    ]);
    expect(r.columns).toEqual(["email", "n", "ok", "when", "none", "extra", "tags"]);
    expect(r.rows[0]).toEqual({ email: "a@x.com", n: "5", ok: "true", when: d.toISOString(), none: "", extra: "", tags: "" });
    expect(r.rows[1]!.tags).toBe('["a","b"]');
  });

  it("reports non-object entries and skips empty ones", () => {
    const r = parseRows([{ email: "a@x.com" }, null as unknown as Record<string, unknown>, { email: "" }]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ row: 1, message: "Row is not an object" }]);
  });
});

describe("render", () => {
  it("substitutes variables", () => {
    expect(render("Hi {{name}}!", { name: "Ram" })).toBe("Hi Ram!");
  });

  it("resolves case-insensitively through aliases", () => {
    const row = { "First Name": "Sita", Surname: "Sharma", Organisation: "Lacspace", "E-mail": "s@x.com" };
    expect(render("{{firstName}} {{LASTNAME}} @ {{company}} <{{email}}>", row)).toBe("Sita Sharma @ Lacspace <s@x.com>");
    expect(render("{{fname}}/{{first_name}}/{{given name}}", { firstname: "A" })).toBe("A/A/A");
    expect(render("{{fullName}}", { Name: "Ram Bahadur" })).toBe("Ram Bahadur");
  });

  it("uses fallback text when empty", () => {
    expect(render("Hi {{name|there}}", { name: "" })).toBe("Hi there");
    expect(render("Hi {{name|dear friend}}", {})).toBe("Hi dear friend");
    expect(render("Hi {{name | there}}", { name: "  " })).toBe("Hi there");
  });

  it("treats known filter names as filters", () => {
    expect(render("{{name | upper}}", { name: "ram" })).toBe("RAM");
    expect(render("{{name|lower}}", { name: "RAM" })).toBe("ram");
    expect(render("{{name|title}}", { name: "ram bahadur THAPA" })).toBe("Ram Bahadur Thapa");
    expect(render("{{name|capitalize}}", { name: "hELLO world" })).toBe("Hello world");
    expect(render("[{{name|trim}}]", { name: "x" })).toBe("[x]");
    expect(render("{{name|first}}", { name: "Ram Bahadur" })).toBe("Ram");
  });

  it("chains filters then a fallback", () => {
    expect(render("Hi {{name | first | upper | there}}", { name: "ram bahadur" })).toBe("Hi RAM");
    expect(render("Hi {{name | first | there}}", { name: "" })).toBe("Hi there");
  });

  it("quoted fallback can equal a filter name", () => {
    expect(render('{{x|"upper"}}', {})).toBe("upper");
    expect(render('{{x|"upper"}}', { x: "a" })).toBe("a");
    expect(render('{{x|" a | b "}}', {})).toBe(" a | b ");
  });

  it("missing: keep leaves the tag", () => {
    expect(render("Hi {{name}}", {}, { missing: "keep" })).toBe("Hi {{name}}");
    expect(render("Hi {{name}}", {})).toBe("Hi ");
  });

  it("supports if/else", () => {
    const t = "{{#if company}}at {{company}}{{else}}independent{{/if}}";
    expect(render(t, { company: "Acme" })).toBe("at Acme");
    expect(render(t, { company: "" })).toBe("independent");
  });

  it("supports unless and nesting", () => {
    expect(render("{{#unless vip}}Buy now{{/unless}}", { vip: "" })).toBe("Buy now");
    expect(render("{{#unless vip}}Buy now{{/unless}}", { vip: "yes" })).toBe("");
    const t = "{{#if a}}A{{#if b}}B{{else}}-{{/if}}{{/if}}";
    expect(render(t, { a: "1", b: "1" })).toBe("AB");
    expect(render(t, { a: "1" })).toBe("A-");
    expect(render(t, {})).toBe("");
  });

  it("escapes HTML only when asked", () => {
    expect(render("{{x}}", { x: "<b>&'\"" }, { escape: true })).toBe("&lt;b&gt;&amp;&#39;&quot;");
    expect(render("{{x}}", { x: "<b>" }, { escape: "html" })).toBe("&lt;b&gt;");
    expect(render("{{x}}", { x: "<b>" }, { escape: "none" })).toBe("<b>");
    expect(render("{{x}}", { x: "<b>" })).toBe("<b>");
  });

  it("never re-parses values (injection safety)", () => {
    const out = render("Hi {{name}} {{secret|none}}", { name: "{{secret}} {{#if x}}", secret: "S3" });
    expect(out).toBe("Hi {{secret}} {{#if x}} S3");
    expect(render("{{constructor}}{{__proto__}}{{toString}}", {})).toBe("");
  });

  it("leaves unknown or malformed tags as text", () => {
    expect(render("a {{ b", { b: "x" })).toBe("a {{ b");
    expect(render("{{/if}}{{#each x}}{{}}", {})).toBe("{{/if}}{{#each x}}{{}}");
  });

  it("stringifies non-string values", () => {
    expect(render("{{n}} {{d}} {{z}}", { n: 3, d: new Date("2026-01-01T00:00:00.000Z"), z: null })).toBe(
      "3 2026-01-01T00:00:00.000Z ",
    );
  });

  it("renders Nepali/Unicode values", () => {
    expect(render("नमस्ते {{name|first}}", { name: "राम बहादुर" })).toBe("नमस्ते राम");
  });
});

describe("findVariables / compileTemplate", () => {
  it("finds variables in order, de-duplicated", () => {
    expect(findVariables("{{a}} {{#if b}}{{c|x}}{{else}}{{A}}{{/if}} {{first_name|upper}} {{firstName}}")).toEqual([
      "a",
      "b",
      "c",
      "first_name",
    ]);
  });

  it("compiles once and renders many", () => {
    const t = compileTemplate("Hi {{name|there}}");
    expect(t.vars).toEqual(["name"]);
    expect(t.render({ name: "A" })).toBe("Hi A");
    expect(t.render({})).toBe("Hi there");
    expect(compileTemplate("{{x}}").render({ x: "<" }, { escape: true })).toBe("&lt;");
  });
});

describe("isValidEmail", () => {
  it("accepts and rejects", () => {
    expect(isValidEmail("ram.thapa+news@mail.example.com.np")).toBe(true);
    expect(isValidEmail("a@example.xn--wgbh1c")).toBe(true);
    for (const bad of ["", "a", "a@", "@x.com", "a@b", "a@@b.com", "a b@x.com", "a..b@x.com", ".a@x.com", "a@-x.com", "a@x.c"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

const rowsOf = (csv: string): Row[] => parseCsv(csv).rows;

describe("merge", () => {
  it("is the same function as mergeAll", () => {
    expect(merge).toBe(mergeAll);
  });

  it("creates one message per row with report", () => {
    const rows = rowsOf("E-mail Address,First Name,Last Name\nram@x.com,Ram,Thapa\nsita@x.com,Sita,Rai");
    const { messages, report } = merge({ subject: "Hi {{firstName}}", text: "Dear {{first name}} {{surname}}" }, rows);
    expect(report).toEqual({ total: 2, ok: 2, skipped: [], missingVars: {} });
    expect(messages[0]).toEqual({
      to: { name: "Ram Thapa", address: "ram@x.com" },
      subject: "Hi Ram",
      text: "Dear Ram Thapa",
      row: rows[0],
      rowIndex: 0,
      warnings: [],
    });
    expect(messages[0]).not.toHaveProperty("html");
  });

  it("takes to.name from name/fullName first", () => {
    const rows = [{ email: "a@x.com", "Full Name": "Ram B. Thapa", firstName: "Ram" }];
    expect(merge({ subject: "x" }, rows).messages[0]!.to).toEqual({ name: "Ram B. Thapa", address: "a@x.com" });
    expect(merge({ subject: "x" }, [{ email: "a@x.com" }]).messages[0]!.to).toEqual({ address: "a@x.com" });
  });

  it("accepts 'Name <addr>' and mailto: cells", () => {
    const m = merge({ subject: "x" }, [{ email: '"Ram T" <Ram@X.com>' }, { email: "mailto:b@x.com" }]);
    expect(m.messages.map((x) => x.to)).toEqual([{ name: "Ram T", address: "Ram@X.com" }, { address: "b@x.com" }]);
  });

  it("escapes values in html but not subject or text", () => {
    const rows = [{ email: "a@x.com", company: "Tom & Jerry <Ltd>" }];
    const m = merge({ subject: "For {{company}}", html: "<p>{{company}}</p>", text: "{{company}}" }, rows).messages[0]!;
    expect(m.html).toBe("<p>Tom &amp; Jerry &lt;Ltd&gt;</p>");
    expect(m.subject).toBe("For Tom & Jerry <Ltd>");
    expect(m.text).toBe("Tom & Jerry <Ltd>");
  });

  it("blocks script injection through html values", () => {
    const rows = [{ email: "a@x.com", name: '<script>alert(1)</script>{{email}}' }];
    const m = merge({ subject: "x", html: "Hi {{name}}" }, rows).messages[0]!;
    expect(m.html).toBe("Hi &lt;script&gt;alert(1)&lt;/script&gt;{{email}}");
  });

  it("collapses CR/LF in subject (header injection)", () => {
    const rows = [{ email: "a@x.com", name: "Ram\r\nBcc: evil@x.com" }];
    const m = merge({ subject: "Hi {{name}}\nthere" }, rows).messages[0]!;
    expect(m.subject).toBe("Hi Ram Bcc: evil@x.com there");
    expect(m.to.name).toBe("Ram Bcc: evil@x.com");
  });

  it("skips missing and invalid emails", () => {
    const rows = rowsOf("email,name\n,NoMail\nnot-an-email,Bad\nok@x.com,Ok");
    const { report } = merge({ subject: "x" }, rows);
    expect(report.ok).toBe(1);
    expect(report.skipped.map((s) => [s.row, s.code])).toEqual([
      [0, "missing_email"],
      [1, "invalid_email"],
    ]);
  });

  it("validateEmail:false only requires a value", () => {
    const { report } = merge({ subject: "x" }, [{ email: "weird" }], { validateEmail: false });
    expect(report.ok).toBe(1);
  });

  it("skips every row when no email column exists", () => {
    const { report } = merge({ subject: "x" }, [{ name: "a" }]);
    expect(report.skipped[0]).toMatchObject({ code: "missing_email", reason: "No email column found" });
  });

  it("uses emailField / emailColumn when given", () => {
    const rows = [{ email: "wrong@x.com", work: "right@x.com" }];
    expect(merge({ subject: "x" }, rows, { emailField: "work" }).messages[0]!.to.address).toBe("right@x.com");
    expect(merge({ subject: "x" }, rows, { emailColumn: "WORK" }).messages[0]!.to.address).toBe("right@x.com");
  });

  it("dedupes case-insensitively by default", () => {
    const rows = [{ email: "A@x.com" }, { email: "a@X.COM" }, { email: "b@x.com" }];
    const r = merge({ subject: "x" }, rows);
    expect(r.report.ok).toBe(2);
    expect(r.report.skipped).toEqual([{ row: 1, code: "duplicate", reason: "a@X.COM already appears in an earlier row" }]);
    expect(merge({ subject: "x" }, rows, { dedupe: false }).report.ok).toBe(3);
  });

  it("suppresses by address and @domain", () => {
    const rows = [{ email: "Bounce@x.com" }, { email: "a@blocked.org" }, { email: "a@sub.blocked.org" }, { email: "ok@x.com" }];
    const r = merge({ subject: "x" }, rows, { suppress: new Set(["bounce@X.com", "@Blocked.org"]) });
    expect(r.report.skipped.map((s) => s.code)).toEqual(["suppressed", "suppressed"]);
    expect(r.messages.map((m) => m.to.address)).toEqual(["a@sub.blocked.org", "ok@x.com"]);
  });

  it("counts missing variables and still sends with a warning", () => {
    const rows = [
      { email: "a@x.com", firstName: "A", company: "" },
      { email: "b@x.com", firstName: "", company: "" },
      { email: "c@x.com", firstName: "", company: "Co" },
    ];
    const r = merge({ subject: "Hi {{firstName}}", html: "{{firstName}} {{company}} {{city|your city}}" }, rows);
    expect(r.report.ok).toBe(3);
    expect(r.report.missingVars).toEqual({ firstName: 2, company: 2 });
    expect(r.messages[1]!.warnings).toEqual([
      'Empty value for {{firstName}}; rendered as ""',
      'Empty value for {{company}}; rendered as ""',
    ]);
    expect(r.messages[1]!.subject).toBe("Hi");
  });

  it("does not count vars used only in a branch not taken", () => {
    const r = merge({ subject: "{{#if company}}{{company}} {{city}}{{/if}}" }, [{ email: "a@x.com", city: "" }]);
    expect(r.report.missingVars).toEqual({});
  });

  it("requireVars skips rows with missing variables", () => {
    const rows = [{ email: "a@x.com", firstName: "A" }, { email: "b@x.com", firstName: "" }];
    const r = merge({ subject: "Hi {{firstName}}" }, rows, { requireVars: true });
    expect(r.report.ok).toBe(1);
    expect(r.report.skipped).toEqual([{ row: 1, code: "missing_variable", reason: "Empty value for {{firstName}}" }]);
    expect(r.report.missingVars).toEqual({ firstName: 1 });
  });

  it("a row skipped by requireVars does not block a later duplicate", () => {
    const rows = [{ email: "a@x.com", firstName: "" }, { email: "a@x.com", firstName: "A" }];
    const r = merge({ subject: "{{firstName}}" }, rows, { requireVars: true });
    expect(r.messages.map((m) => m.rowIndex)).toEqual([1]);
  });

  it("warns on role addresses without skipping", () => {
    const rows = ["info", "admin", "noreply", "no-reply", "support", "sales", "ram"].map((l) => ({ email: `${l}@x.com` }));
    const r = merge({ subject: "x" }, rows);
    expect(r.report.ok).toBe(7);
    expect(r.messages.filter((m) => m.warnings.some((w) => w.includes("role address")))).toHaveLength(6);
  });

  it("caps at max and reports the rest", () => {
    const rows = [{ email: "a@x.com" }, { email: "bad" }, { email: "b@x.com" }, { email: "c@x.com" }];
    const r = merge({ subject: "x" }, rows, { max: 2 });
    expect(r.messages.map((m) => m.to.address)).toEqual(["a@x.com", "b@x.com"]);
    expect(r.report.skipped.map((s) => s.code)).toEqual(["invalid_email", "max_reached"]);
    expect(merge({ subject: "x" }, rows, { max: 0 }).report.ok).toBe(0);
  });

  it("extra as an object overrides row values", () => {
    const r = merge({ subject: "{{brand}} {{name}}" }, [{ email: "a@x.com", name: "A" }], { extra: { brand: "Lacspace", name: "Z" } });
    expect(r.messages[0]!.subject).toBe("Lacspace Z");
    expect(r.messages[0]!.row).toEqual({ email: "a@x.com", name: "A" });
  });

  it("extra as a function gets each row", () => {
    const r = merge(
      { subject: "x", html: '<a href="{{unsubscribeUrl}}">Unsubscribe</a>' },
      [{ email: "a@x.com" }, { email: "b&c@x.com" }],
      { extra: (row) => ({ unsubscribeUrl: `https://u.example/?e=${row.email}&t=1` }) },
    );
    expect(r.messages[0]!.html).toBe('<a href="https://u.example/?e=a@x.com&amp;t=1">Unsubscribe</a>');
    expect(r.messages[1]!.html).toContain("e=b&amp;c@x.com");
  });

  it("handles Nepali/Unicode values end to end", () => {
    const rows = rowsOf("﻿इमेल;First Name;Company\nram@x.com;राम;लाक्स्पेस", );
    const r = merge({ subject: "नमस्ते {{firstName}}", html: "<p>{{company}}</p>" }, rows, { emailField: "इमेल" });
    expect(r.messages[0]!.subject).toBe("नमस्ते राम");
    expect(r.messages[0]!.html).toBe("<p>लाक्स्पेस</p>");
    expect(r.messages[0]!.to).toEqual({ name: "राम", address: "ram@x.com" });
  });

  it("works with parseRows arrays", () => {
    const { rows } = parseRows([
      { Email: "a@x.com", "First Name": "A", Joined: new Date("2026-05-01T00:00:00.000Z") },
      { Email: "b@x.com", "First Name": null },
    ]);
    const r = merge({ subject: "Hi {{firstName|friend}}", text: "{{#if joined}}Since {{joined}}{{/if}}" }, rows);
    expect(r.messages.map((m) => m.subject)).toEqual(["Hi A", "Hi friend"]);
    expect(r.messages[0]!.text).toBe("Since 2026-05-01T00:00:00.000Z");
    expect(r.messages[1]!.text).toBe("");
  });

  it("returns an empty result for no rows", () => {
    expect(merge({ subject: "x" }, [])).toEqual({ messages: [], report: { total: 0, ok: 0, skipped: [], missingVars: {} } });
  });
});
