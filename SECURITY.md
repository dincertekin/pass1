# Security policy

## Supported versions

pass1 is a work in progress. Security fixes go into the `main` branch; if you
host it yourself, update to the latest commit to get them.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them
privately on GitHub instead: go to the
[Security tab](https://github.com/dincertekin/pass1/security) and click
**Report a vulnerability**.

Helpful to include:

- what an attacker could do, and what they need first (an account? control of the server? a network position?);
- steps to reproduce, or a small proof of concept;
- the commit you tested and how it runs (development, Docker Compose, your own setup).

You'll get a reply as soon as possible. Once a fix is released, you're
credited in the release notes unless you'd rather not be.

## Scope

The [threat model](README.md#threat-model) says what pass1 protects against
and what it doesn't. Known findings and accepted risks are in
[docs/security-review.md](docs/security-review.md); please check there first.
