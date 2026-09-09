# Git hooks

Lacspace policy: every commit is authored solely by **Lacspace**. The `commit-msg`
hook strips any `Co-Authored-By:` trailer or AI-generation attribution so third
parties (e.g. `noreply@anthropic.com`) never appear in the GitHub contributor graph.

Enable once per clone:

    git config core.hooksPath .githooks
