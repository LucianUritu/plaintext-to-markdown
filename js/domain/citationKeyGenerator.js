export class CitationKeyGenerator {
  create(reference = {}) {
    const firstAuthor = String(reference.authors || "anonymous")
      .split(/\s+(?:and|&)\s+|;/i)[0]
      .trim()
      .split(/\s+/)
      .pop();
    const yearMatch = String(reference.year || "").match(/\d{4}/);
    const titleMatch = String(reference.title || "source")
      .toLowerCase()
      .match(/[a-z0-9]+/);

    return (
      this.slug(firstAuthor || "anonymous") +
      (yearMatch ? yearMatch[0] : "nd") +
      this.slug(titleMatch ? titleMatch[0] : "source")
    );
  }

  createUnique(references, reference) {
    const baseKey = this.create(reference);
    const existingKeys = new Set(
      (Array.isArray(references) ? references : []).map((item) => item.key)
    );

    if (!existingKeys.has(baseKey)) {
      return baseKey;
    }

    let suffix = 2;
    while (existingKeys.has(baseKey + suffix)) {
      suffix += 1;
    }
    return baseKey + suffix;
  }

  slug(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
}
