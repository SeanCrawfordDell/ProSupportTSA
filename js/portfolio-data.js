"use strict";
// Tool Portfolio settings and fallback copy of the ISG Tools Catalog.
// The page reads liveUrl (the catalog's own tools.json, published next to the catalog site) every time it opens, so
// owners, statuses and tools follow the catalog automatically. The tools below are shown only when that file cannot be
// reached. Refresh them with scripts/sync-portfolio-from-catalog.cjs instead of editing by hand.
const PortfolioData = {
  "source": "ISG Tools Catalog",
  "sourceUrl": "https://seancrawforddell.github.io/ISGToolsCatalog/",
  "liveUrl": "../ISGToolsCatalog/tools.json",
  "snapshotDate": "2026-10-29",
  "tools": [
    {
      "id": "tool-001",
      "name": "Dell ProSupport ToolBox",
      "category": "Log Collection",
      "description": "Central launcher interface for Dell ProSupport utilities and troubleshooting tools.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-002",
      "name": "AzHCIUrlChecker",
      "category": "Utility",
      "description": "Connectivity checker for Azure Local endpoints and firewall requirements.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows",
        "Azure Local"
      ]
    },
    {
      "id": "tool-003",
      "name": "BOILER",
      "category": "Diagnostics",
      "description": "CBS and DISM log analyzer for Windows servicing failures and corruption.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-004",
      "name": "DART",
      "category": "Updates & Maintenance",
      "description": "Dell Automated Server Updater for Windows Failover Cluster and HCI/S2D environments.",
      "owner": "Jim.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-005",
      "name": "FLEP",
      "category": "Diagnostics",
      "description": "Windows event log filter for common server, failover-clustering, and storage events.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-006",
      "name": "GetHyperVBottlenecks",
      "category": "Diagnostics",
      "description": "Hyper-V performance bottleneck detection tool.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-007",
      "name": "iDRAC Connection Manager",
      "category": "Server Management",
      "description": "PowerShell Windows Forms interface for managing Dell server iDRAC access.",
      "owner": "Jim.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-008",
      "name": "KeyRelay",
      "category": "Utility",
      "description": "GUI utility for sending text to applications that block clipboard paste operations.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-009",
      "name": "LogCollector",
      "category": "Log Collection",
      "description": "Comprehensive log collection tool for Windows, Dell servers, and supported switches.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-010",
      "name": "GetShowTech",
      "category": "Log Collection",
      "description": "Dell switch show-tech diagnostic output collection tool.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-011",
      "name": "SDDC Dell Enhanced",
      "category": "Log Collection",
      "description": "SDDC diagnostic data collection workflow for Azure Stack HCI environments.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-012",
      "name": "SDDC Offline Dell Enhanced",
      "category": "Log Collection",
      "description": "Offline SDDC diagnostic data collection for environments without internet access.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-013",
      "name": "TSR Collector",
      "category": "Log Collection",
      "description": "Dell Technical Support Report collector for cluster nodes via iDRAC.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-014",
      "name": "TALI",
      "category": "Diagnostics",
      "description": "Test-DellAzureLocalIssues - Azure Local cluster health and configuration checker.",
      "owner": "Tommy.Paulk@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-015",
      "name": "FLCkr",
      "category": "Diagnostics",
      "description": "File-system filter driver altitude checker for Windows troubleshooting.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-016",
      "name": "Convert-Etl2Pcap",
      "category": "Utility",
      "description": "Windows ETL network trace to PCAP format converter.",
      "owner": "Jimy.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-017",
      "name": "CluChk",
      "category": "Diagnostics",
      "description": "CluChk (Cluster Checker) is a comprehensive PowerShell diagnostic analysis tool for Dell S2D Ready Node and Azure Local deployments. It processes multiple types of diagnostic logs—including Show Tech-Support, Support Assist collections, SDDC and performance reports—to generate interactive HTML reports that validate deployment compliance against Dell's official deployment guides.",
      "owner": "Jim.Gandy@dell.com, Tommy.Paulk@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-018",
      "name": "DriFT",
      "category": "Diagnostics",
      "description": "Driver and firmware validation tool for Windows and Azure Local servers.",
      "owner": "Jim.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-019",
      "name": "SLIC",
      "category": "Log Collection",
      "description": "SLIC is a Dell switch Log Collection tool designed for Azure Local environments. It parses Dell switch logs, validates switch configurations against Azure Local recommended settings, and generates a detailed HTML report for troubleshooting and compliance review.",
      "owner": "Jim.Gandy@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-020",
      "name": "Windows Update Investigator",
      "category": "Diagnostics",
      "description": "Devin Windows Update Investigator is an AI-assisted PowerShell tool that analyzes Dell TSS and Windows servicing evidence to identify Windows Update failures and produce a professional HTML investigation report.",
      "owner": "APJ Microsoft Team",
      "status": "internal-testing",
      "progress": "Working Prototype",
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-021",
      "name": "OME Built-In Account Reset",
      "category": "Utility",
      "description": "Script to reset the OpenManage Enterprise (OME) built-in admin account password using the OME API.",
      "owner": "Ted.Park@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-022",
      "name": "Time Tracker Web",
      "category": "Utility",
      "description": "Web-based time tracking application for monitoring and managing work hours.",
      "owner": "Michael.Daniels@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "Windows"
      ]
    },
    {
      "id": "tool-023",
      "name": "ESX Top Data Viewer",
      "category": "Diagnostics",
      "description": "Web-based viewer for ESX top performance data from VMware ESXi environments.",
      "owner": "Michael.Daniels@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "ESX"
      ]
    },
    {
      "id": "tool-024",
      "name": "vSAN Analyzer Viewer",
      "category": "Diagnostics",
      "description": "Web-based viewer for vSAN health and performance analysis data from VMware environments.",
      "owner": "Michael.Daniels@dell.com",
      "status": "released",
      "progress": 100,
      "operatingSystem": [
        "ESX"
      ]
    }
  ]
};
if (typeof window !== "undefined") window.PortfolioData = PortfolioData;
if (typeof module !== "undefined") module.exports = PortfolioData;
