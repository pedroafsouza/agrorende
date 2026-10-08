/**
 * Side-effect barrel: importing a mutator module registers its mutators with `defineMutator`, so a
 * scope-reset rebase can re-run every pending command locally (change request T06-003). The session
 * bootstrap imports this file once before the sync engine starts.
 */
import "./assets";
import "./jobs";
import "./media";
import "./notifications";
import "./rentals";
import "./reports";
import "./user";
