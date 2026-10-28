"use strict";
// Tool Portfolio data: one entry per tool in the ISG Tools Catalog. portfolio.html reads this list.
// Fields (all optional except name):
//   id          short unique id, e.g. "case-notes"
//   name        tool name as shown in the catalog
//   category    catalog category
//   description one line from the catalog
//   link        catalog or tool URL (http/https only)
//   owner       one accountable person
//   stage       Intake | Design | Build | Test | Release | Support
//   health      On track | At risk | Off track   (set by the owner each week)
//   tasksDone / tasksTotal   sub-issues closed / total on the tool's tracking issue
//   target      next milestone date as shown, e.g. "Nov 21"
//   note        one-line status or blocker from the owner
//   updated     date the owner last reviewed the row, YYYY-MM-DD
const PortfolioData = {
  source: "ISG Tools Catalog",
  sourceUrl: "https://pages.eos2git.cec.lab.emc.com/Sean-Crawford/ISGToolsCatalog/",
  tools: []
};
if (typeof window !== "undefined") window.PortfolioData = PortfolioData;
if (typeof module !== "undefined") module.exports = PortfolioData;
