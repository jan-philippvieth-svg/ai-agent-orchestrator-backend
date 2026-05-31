import { estimateTokens } from '../utils/tokenEstimator.js';

// ── Tool catalog ─────────────────────────────────────────────────────────────
// Each entry: [name, description, paramsSchema, category]
// 100 tools across 11 enterprise systems — fully static/deterministic.

const RAW_TOOLS: readonly [string, string, string, string][] = [
  // CRM (10)
  ['crm.lookupCustomer',       'Retrieves complete customer profile by unique ID including contact details and account status.',                   'customerId:string, fields?:string[], includeHistory?:boolean',                        'crm'],
  ['crm.searchAccounts',       'Searches CRM accounts by name, industry, revenue range, or region with pagination support.',                      'query:string, industry?:string, minRevenue?:number, limit?:number',                   'crm'],
  ['crm.listContacts',         'Lists all contacts associated with a given account including their roles and preferred contact methods.',           'accountId:string, role?:string, limit?:number, offset?:number',                       'crm'],
  ['crm.updateContact',        'Updates contact record fields such as email, phone, title, or custom CRM properties.',                            'contactId:string, updates:Record<string,unknown>',                                    'crm'],
  ['crm.getOpportunities',     'Retrieves open and closed sales opportunities for a specific account with stage and deal value.',                  'accountId:string, status?:string, minValue?:number',                                  'crm'],
  ['crm.createLead',           'Creates a new sales lead from an external data source with campaign attribution and scoring.',                    'email:string, name:string, source:string, score?:number',                             'crm'],
  ['crm.getActivityHistory',   'Returns chronological interaction history for a customer including calls, emails, and meetings.',                  'customerId:string, fromDate?:string, types?:string[], limit?:number',                 'crm'],
  ['crm.mergeDuplicates',      'Merges two duplicate customer records into one canonical record preserving all history.',                         'primaryId:string, duplicateId:string, keepFields?:string[]',                          'crm'],
  ['crm.getRevenueSummary',    'Aggregates revenue metrics per customer including ARR, MRR, churn probability, and lifetime value.',              'customerId:string, period?:string, currency?:string',                                 'crm'],
  ['crm.exportCustomerData',   'Exports customer dataset as CSV or JSON with configurable field selection and optional filters.',                  'filter?:object, format?:string, fields?:string[]',                                    'crm'],
  // Jira (10)
  ['jira.searchIssues',        'Searches Jira issues using JQL query language with configurable field projection and pagination.',                 'jql:string, fields?:string[], maxResults?:number, startAt?:number',                   'jira'],
  ['jira.getIssue',            'Retrieves full details of a specific Jira issue by key including comments, labels, and links.',                   'issueKey:string, fields?:string[], expand?:string[]',                                 'jira'],
  ['jira.createIssue',         'Creates a new Jira issue in the specified project with type, summary, description, and metadata.',               'projectKey:string, issueType:string, summary:string, fields?:object',                 'jira'],
  ['jira.updateIssue',         'Updates fields of an existing Jira issue such as assignee, priority, status, or custom fields.',                  'issueKey:string, fields:Record<string,unknown>',                                      'jira'],
  ['jira.getIssueMetrics',     'Calculates aggregate metrics for a set of issues including cycle time, throughput, and resolution.',              'jql:string, metrics?:string[], period?:string',                                       'jira'],
  ['jira.listProjects',        'Lists all Jira projects accessible to the current user with key, name, type, and category.',                     'type?:string, category?:string, expand?:string[]',                                    'jira'],
  ['jira.getSprint',           'Returns sprint details including goals, dates, velocity, and contained issues for a board.',                      'boardId:number, state?:string, sprintId?:number',                                     'jira'],
  ['jira.assignIssue',         'Assigns a Jira issue to a specific user identified by their account ID or username.',                            'issueKey:string, accountId:string',                                                   'jira'],
  ['jira.addComment',          'Adds a formatted comment with optional mentions and visibility restrictions to a Jira issue.',                    'issueKey:string, body:string, visibility?:object',                                    'jira'],
  ['jira.getWorklog',          'Retrieves time tracking work log entries for an issue or user within a given date range.',                        'issueKey?:string, accountId?:string, fromDate?:string, toDate?:string',               'jira'],
  // GitHub (10)
  ['github.searchRepos',       'Searches GitHub repositories by name, language, stars, topic, or organization with sorting options.',            'query:string, language?:string, org?:string, sort?:string, limit?:number',            'github'],
  ['github.createPullRequest', 'Opens a new pull request with title, description, and reviewers between specified branches.',                    'repo:string, title:string, head:string, base:string, body?:string',                  'github'],
  ['github.listIssues',        'Lists repository issues with filter by state, label, assignee, milestone, and creation date.',                   'repo:string, state?:string, labels?:string[], assignee?:string, limit?:number',       'github'],
  ['github.getCommitHistory',  'Retrieves commit history for a branch or path with author, message, and diff statistics.',                       'repo:string, branch?:string, path?:string, since?:string, limit?:number',             'github'],
  ['github.reviewPullRequest', 'Submits a code review on a pull request with approve, request-changes, or comment event.',                      'repo:string, prNumber:number, event:string, body?:string, comments?:object[]',        'github'],
  ['github.mergePullRequest',  'Merges an approved pull request using merge commit, squash, or rebase strategy.',                               'repo:string, prNumber:number, mergeMethod?:string, commitMessage?:string',             'github'],
  ['github.getFileContent',    'Reads the content of a file in a repository at a specific branch or commit reference.',                         'repo:string, path:string, ref?:string',                                               'github'],
  ['github.createBranch',      'Creates a new branch in a repository from a specified source branch or commit SHA.',                            'repo:string, branchName:string, fromRef:string',                                      'github'],
  ['github.getCodeReview',     'Returns code review status, reviewer comments, and approval counts for a pull request.',                        'repo:string, prNumber:number, includeComments?:boolean',                              'github'],
  ['github.searchCode',        'Searches code across all accessible repositories using GitHub code search syntax.',                             'query:string, repo?:string, language?:string, path?:string, limit?:number',            'github'],
  // Azure / AD (10)
  ['azure.searchUsers',        'Searches Azure Active Directory users by name, email, department, or job title.',                               'query:string, department?:string, jobTitle?:string, limit?:number',                   'azure'],
  ['azure.getGroup',           'Returns Azure AD group details including membership list, owners, and applied group policy.',                    'groupId:string, expand?:string[], includeMembers?:boolean',                           'azure'],
  ['azure.assignRole',         'Assigns an Azure RBAC role to a user or service principal on a specific resource scope.',                       'principalId:string, roleId:string, scope:string',                                     'azure'],
  ['azure.getResources',       'Lists Azure resources in a subscription filtered by type, resource group, or tag values.',                      'subscription?:string, resourceGroup?:string, type?:string, tags?:object',              'azure'],
  ['azure.listSubscriptions',  'Returns all Azure subscriptions accessible by the authenticated service principal.',                            'filter?:string, expand?:string[]',                                                    'azure'],
  ['azure.getMetrics',         'Retrieves time-series metrics for an Azure resource such as CPU, memory, or network throughput.',               'resourceId:string, metrics:string[], interval?:string, from?:string, to?:string',     'azure'],
  ['azure.createVM',           'Provisions a new Azure virtual machine with specified size, image, and network configuration.',                 'name:string, size:string, image:string, resourceGroup:string, location:string',       'azure'],
  ['azure.getStorageInfo',     'Returns Azure storage account details including capacity, access tier, and replication type.',                  'accountName:string, resourceGroup?:string, includeUsage?:boolean',                    'azure'],
  ['azure.listNSGs',           'Lists network security groups and their inbound/outbound rules for a given resource group.',                    'resourceGroup:string, subscription?:string',                                          'azure'],
  ['azure.getKeyVaultSecrets', 'Lists secret names in an Azure Key Vault without revealing secret values or metadata.',                         'vaultName:string, includeManaged?:boolean, maxResults?:number',                       'azure'],
  // Confluence (10)
  ['confluence.searchPages',   'Searches Confluence pages by title, content, space, or label using CQL query syntax.',                         'cql:string, space?:string, expand?:string[], limit?:number',                          'confluence'],
  ['confluence.getPage',       'Retrieves full content and metadata of a Confluence page including its version history.',                       'pageId:string, expand?:string[], includeBody?:boolean',                               'confluence'],
  ['confluence.createPage',    'Creates a new Confluence page with title, body content, and optional parent in a space.',                      'spaceKey:string, title:string, body:string, parentId?:string, labels?:string[]',      'confluence'],
  ['confluence.updatePage',    'Updates the content or metadata of an existing page with version conflict detection.',                         'pageId:string, title?:string, body?:string, version:number',                          'confluence'],
  ['confluence.listSpaces',    'Returns all Confluence spaces accessible to the current user with keys and descriptions.',                     'type?:string, status?:string, limit?:number',                                         'confluence'],
  ['confluence.getComments',   'Retrieves all inline and page-level comments for a Confluence page with author details.',                      'pageId:string, depth?:string, expand?:string[], limit?:number',                       'confluence'],
  ['confluence.exportPage',    'Exports a Confluence page to PDF, Word, or HTML format for offline reading or distribution.',                  'pageId:string, format:string, includeAttachments?:boolean',                           'confluence'],
  ['confluence.getPageHistory','Returns revision history of a Confluence page with diff information between versions.',                        'pageId:string, limit?:number, start?:number',                                         'confluence'],
  ['confluence.addLabel',      'Adds classification labels to a Confluence page for improved search and content governance.',                   'pageId:string, labels:string[]',                                                      'confluence'],
  ['confluence.searchAttach',  'Searches Confluence attachments by filename, media type, or associated page within a space.',                  'space?:string, filename?:string, mediaType?:string, limit?:number',                   'confluence'],
  // SAP (10)
  ['sap.searchReports',        'Searches SAP financial and operational reports by category, date range, or cost center.',                      'category?:string, costCenter?:string, from?:string, to?:string, limit?:number',       'sap'],
  ['sap.getFinancialData',     'Retrieves financial posting data including debits, credits, and balances for a GL account.',                   'account:string, fiscalYear:string, period?:string, currency?:string',                 'sap'],
  ['sap.getPurchaseOrders',    'Fetches purchase orders by vendor, status, value range, or creation date from SAP MM.',                       'vendor?:string, status?:string, minValue?:number, from?:string, limit?:number',       'sap'],
  ['sap.getInventoryLevels',   'Returns current inventory levels and stock movements for materials across storage locations.',                  'material?:string, plant?:string, storageLocation?:string',                           'sap'],
  ['sap.runMaterialFlow',      'Executes material flow analysis for a production order showing BOM explosion and costs.',                      'productionOrder:string, includeComponents?:boolean, currency?:string',                'sap'],
  ['sap.getCostCenter',        'Retrieves cost center master data including hierarchies, assignments, and budget allocations.',                 'costCenter:string, controllingArea?:string, fiscalYear?:string',                      'sap'],
  ['sap.getGLAccount',         'Returns general ledger account details with posting restrictions, currency, and tax category.',                'account:string, chartOfAccounts:string, includeBalances?:boolean',                    'sap'],
  ['sap.generateReport',       'Generates an ad-hoc SAP report from ABAP report program with configurable selection criteria.',               'reportName:string, selectionCriteria?:object, outputFormat?:string',                  'sap'],
  ['sap.getVendorData',        'Retrieves vendor master data including payment terms, bank details, and purchasing info.',                     'vendorId:string, companyCode?:string, expand?:string[]',                              'sap'],
  ['sap.getProjectStatus',     'Returns PS project status, WBS elements, and actual vs planned costs with milestone list.',                    'projectId:string, includeWBS?:boolean, currency?:string',                             'sap'],
  // Odoo (10)
  ['odoo.searchOrders',        'Searches Odoo sales orders by customer, status, date range, or sales team with aggregations.',                 'customerId?:number, status?:string, from?:string, to?:string, limit?:number',         'odoo'],
  ['odoo.getInventory',        'Returns current inventory position for products across all warehouses with reorder points.',                   'productId?:number, warehouseId?:number, includeForecasts?:boolean',                   'odoo'],
  ['odoo.createInvoice',       'Creates a customer invoice in Odoo from an order reference or manual line item entries.',                     'customerId:number, lines:object[], dueDate?:string, paymentTerms?:string',             'odoo'],
  ['odoo.getPartner',          'Retrieves partner/vendor master record with contacts, pricelist, and purchase history.',                      'partnerId:number, expand?:string[]',                                                  'odoo'],
  ['odoo.updateStock',         'Updates inventory stock levels via inventory adjustment or inter-warehouse transfer.',                         'productId:number, warehouseId:number, quantity:number, reason?:string',               'odoo'],
  ['odoo.getPurchaseOrder',    'Fetches purchase order with vendor details, order lines, and delivery schedule from Odoo.',                   'poId:number, includeLines?:boolean, includeDeliveries?:boolean',                      'odoo'],
  ['odoo.getProjectTasks',     'Lists project tasks with assigned users, stages, deadlines, and time tracking data.',                         'projectId:number, stage?:string, assigneeId?:number, limit?:number',                  'odoo'],
  ['odoo.generateQuotation',   'Generates a sales quotation PDF for a customer based on pricelist and product selection.',                    'customerId:number, products:object[], validityDays?:number',                          'odoo'],
  ['odoo.getAccountingReport', 'Produces accounting reports such as balance sheet, P&L, or trial balance for a period.',                     'reportType:string, from:string, to:string, currency?:string, companyId?:number',      'odoo'],
  ['odoo.createMfgOrder',      'Creates a manufacturing order in Odoo MRP with BOM, quantity, and scheduling data.',                         'productId:number, quantity:number, bomId?:number, scheduledDate?:string',             'odoo'],
  // ServiceNow (10)
  ['servicenow.searchIncidents','Searches ServiceNow incidents by caller, category, priority, state, or affected CI.',                       'query?:string, caller?:string, priority?:string, state?:string, limit?:number',       'servicenow'],
  ['servicenow.createIncident','Creates a new IT service incident with category, impact, urgency, and assignment group.',                    'short_description:string, caller:string, category?:string, priority?:string',         'servicenow'],
  ['servicenow.updateIncident','Updates an existing incident with new state, assignment, work notes, or resolution.',                        'sysId:string, updates:Record<string,unknown>',                                        'servicenow'],
  ['servicenow.getChanges',    'Retrieves change management records including approvals, risk assessment, and schedule.',                     'type?:string, state?:string, assignedTo?:string, from?:string, limit?:number',        'servicenow'],
  ['servicenow.assignIncident','Assigns or reassigns an incident to a specific agent or group with optional SLA reset.',                     'sysId:string, assignedTo?:string, assignedGroup?:string, resetSla?:boolean',          'servicenow'],
  ['servicenow.searchKB',      'Searches the ServiceNow knowledge base for relevant articles by keyword or category.',                       'query:string, category?:string, workflow?:string, limit?:number',                     'servicenow'],
  ['servicenow.getSLAStatus',  'Returns SLA compliance data for incidents or tasks including breach risk and actual times.',                  'taskId?:string, slaDefinition?:string, breachOnly?:boolean',                          'servicenow'],
  ['servicenow.createProblem', 'Creates a problem record for root cause analysis linking it to one or more incidents.',                      'title:string, relatedIncidents?:string[], category?:string, priority?:string',        'servicenow'],
  ['servicenow.getCMDB',       'Retrieves a Configuration Management Database record for an IT asset with its relationships.',               'ciSysId:string, expand?:string[], includeRelations?:boolean',                         'servicenow'],
  ['servicenow.runWorkflow',   'Triggers a ServiceNow workflow or flow with specified input parameters on a target record.',                  'workflow:string, recordSysId:string, inputs?:Record<string,unknown>',                 'servicenow'],
  // Slack (10)
  ['slack.sendMessage',        'Sends a formatted message to a Slack channel or direct message with optional attachments.',                  'channel:string, text:string, blocks?:object[], attachments?:object[]',                'slack'],
  ['slack.searchChannels',     'Searches Slack channels by name, topic, purpose, or member count with type filter.',                        'query?:string, type?:string, excludeArchived?:boolean, limit?:number',                'slack'],
  ['slack.getUserInfo',        'Returns Slack user profile including display name, email, timezone, and current status.',                    'userId:string, includeLocale?:boolean',                                               'slack'],
  ['slack.searchMessages',     'Searches messages across accessible Slack channels with date range and channel filters.',                    'query:string, in?:string, from?:string, after?:string, limit?:number',                'slack'],
  ['slack.createChannel',      'Creates a new Slack channel with specified name, privacy level, and optional topic.',                       'name:string, isPrivate?:boolean, topic?:string, inviteUsers?:string[]',               'slack'],
  ['slack.getChannelHistory',  'Retrieves message history from a Slack channel with pagination and thread expansion.',                       'channel:string, limit?:number, oldest?:string, latest?:string, includeThreads?:boolean','slack'],
  ['slack.uploadFile',         'Uploads a file to one or more Slack channels with optional title and initial comment.',                     'channels:string[], content:string, filename:string, title?:string',                   'slack'],
  ['slack.setReminder',        'Sets a time-based reminder for a Slack user with custom message and recurrence options.',                    'userId:string, text:string, time:string, recurrence?:string',                         'slack'],
  ['slack.getWorkspaceStats',  'Retrieves Slack workspace analytics including active users, message volume, and app usage.',                  'period?:string, teamId?:string',                                                      'slack'],
  ['slack.listReactions',      'Lists emoji reactions on a specific Slack message with reactor user IDs and reaction counts.',              'channel:string, timestamp:string, full?:boolean',                                     'slack'],
  // Analytics (5)
  ['analytics.queryData',      'Executes an analytics query on product or business data with dimension and metric selection.',               'metric:string, dimensions?:string[], filters?:object, from:string, to:string',        'analytics'],
  ['analytics.generateReport', 'Generates a scheduled or ad-hoc analytics report in PDF or CSV format with embedded charts.',               'reportId:string, params?:object, format?:string, recipients?:string[]',               'analytics'],
  ['analytics.getDashboard',   'Returns a dashboard snapshot with current KPI values, trends, and goal completion status.',                  'dashboardId:string, period?:string, compareWith?:string',                             'analytics'],
  ['analytics.getRetention',   'Calculates user retention cohort analysis for specified acquisition periods and intervals.',                  'cohort:string, periods:number, segmentBy?:string',                                    'analytics'],
  ['analytics.getFunnelData',  'Retrieves conversion funnel analytics with step-by-step dropout rates and segment breakdown.',              'funnelId:string, from:string, to:string, segment?:string',                            'analytics'],
  // Monitoring (5)
  ['monitoring.getAlerts',     'Returns active monitoring alerts filtered by severity, service, or alert rule category.',                    'severity?:string, service?:string, state?:string, limit?:number',                     'monitoring'],
  ['monitoring.getMetrics',    'Queries time-series metrics from monitoring backend with aggregation and downsampling.',                     'query:string, from:string, to:string, step?:string, aggregation?:string',             'monitoring'],
  ['monitoring.createAlert',   'Creates a new monitoring alert rule with threshold, condition, and notification configuration.',            'name:string, query:string, threshold:number, severity:string, channels?:string[]',    'monitoring'],
  ['monitoring.getHealth',     'Returns overall service health status with per-component availability and error rate metrics.',              'service?:string, includeHistory?:boolean, window?:string',                            'monitoring'],
  ['monitoring.getDependencies','Generates a service dependency map with latency, error rates, and traffic between services.',              'service:string, depth?:number, includeMetrics?:boolean',                              'monitoring'],
];

export interface EnterpriseTool {
  name: string;
  description: string;
  paramsSchema: string;
  category: string;
  estimatedTokens: number;
}

// Compute once at module level — fully deterministic
export const TOOL_CATALOG: EnterpriseTool[] = RAW_TOOLS.map(([name, description, paramsSchema, category]) => ({
  name,
  description,
  paramsSchema,
  category,
  estimatedTokens: estimateTokens(`${name}: ${description} Params: ${paramsSchema}`),
}));

// ── Tool routing test cases ───────────────────────────────────────────────────
// relevantTools: names of tools selected for this query (deterministic subset)

export interface ToolRoutingTestCase {
  query: string;
  category: string;
  relevantTools: string[];
}

export const TOOL_ROUTING_CASES: ToolRoutingTestCase[] = [
  {
    query: 'Zeige alle offenen Jira-Tickets für Projekt ARCH-Q3',
    category: 'jira',
    relevantTools: ['jira.searchIssues', 'jira.getIssueMetrics', 'jira.listProjects'],
  },
  {
    query: 'Erstelle ein neues kritisches Jira-Issue für den Produktionsfehler',
    category: 'jira',
    relevantTools: ['jira.createIssue', 'jira.assignIssue', 'jira.getIssue'],
  },
  {
    query: 'Suche nach CRM-Accounts mit Jahresumsatz über 500.000 Euro',
    category: 'crm',
    relevantTools: ['crm.searchAccounts', 'crm.getRevenueSummary', 'crm.getOpportunities'],
  },
  {
    query: 'Zeige die vollständige Aktivitätshistorie für Kunden ID-2847',
    category: 'crm',
    relevantTools: ['crm.getActivityHistory', 'crm.lookupCustomer', 'crm.listContacts'],
  },
  {
    query: 'Erstelle einen Pull Request vom Feature-Branch zum main Branch',
    category: 'github',
    relevantTools: ['github.createPullRequest', 'github.reviewPullRequest', 'github.createBranch'],
  },
  {
    query: 'Suche alle GitHub Repositories mit dem Topic kubernetes und mehr als 500 Stars',
    category: 'github',
    relevantTools: ['github.searchRepos', 'github.searchCode', 'github.listIssues'],
  },
  {
    query: 'Suche Azure AD Nutzer aus der Abteilung Engineering',
    category: 'azure',
    relevantTools: ['azure.searchUsers', 'azure.getGroup'],
  },
  {
    query: 'Finde Confluence-Seiten zur internen API-Dokumentation',
    category: 'confluence',
    relevantTools: ['confluence.searchPages', 'confluence.getPage'],
  },
  {
    query: 'Hole den SAP Finanzbericht Kostenstelle 4200 für Q3 2024',
    category: 'sap',
    relevantTools: ['sap.searchReports', 'sap.getFinancialData'],
  },
  {
    query: 'Zeige offene Bestellungen in Odoo für Lieferant ID 42',
    category: 'odoo',
    relevantTools: ['odoo.searchOrders', 'odoo.getPurchaseOrder'],
  },
  {
    query: 'Erstelle einen ServiceNow Incident Severity 1 für den Produktionsausfall',
    category: 'servicenow',
    relevantTools: ['servicenow.createIncident', 'servicenow.assignIncident'],
  },
  {
    query: 'Sende eine Statusbenachrichtigung an den Slack Engineering-Kanal',
    category: 'slack',
    relevantTools: ['slack.sendMessage', 'slack.searchChannels'],
  },
];

// ── Model routing test queries ────────────────────────────────────────────────
// 20 queries — 8 simple / 6 medium / 6 complex (deterministic classification)
// Matched against ClassifierService patterns in classifier.service.ts

export const MODEL_ROUTING_QUERIES: string[] = [
  // simple (simplePatterns or hallo/hi/danke/bitte)
  'Hallo, kannst du mir helfen?',
  'Danke für die Erklärung',
  'Hi, kurze Frage zum System',
  'Erkläre kurz, was ein API-Gateway ist',
  'Übersetze diesen Text ins Englische',
  'Bitte reformuliere diesen Absatz',
  'Umformulieren für eine formelle E-Mail',
  'Kurze E-Mail an den Kunden schreiben',
  // medium (warum / vergleiche / technisch / rag / fasse zusammen)
  'Warum sollte man Docker für Microservices nutzen?',
  'Vergleiche REST APIs mit GraphQL Endpoints',
  'Was ist RAG und wie verbessert es LLM-Antworten?',
  'Fasse die wichtigsten Punkte aus dem Dokument zusammen',
  'Technische Erklärung des Caching-Mechanismus',
  'Erkläre die technischen Unterschiede zwischen SQL und NoSQL',
  // complex (complexPatterns: architektur / codeanalyse / security / skalierung / migration / systemdesign)
  'Analysiere die Systemarchitektur und identifiziere alle Schwachstellen',
  'Führe eine vollständige Codeanalyse des Authentication-Moduls durch',
  'Security-Review und Schwachstellenanalyse der gesamten API-Infrastruktur',
  'Plane die Skalierung der Plattform auf 100.000 gleichzeitige Nutzer',
  'Migration der monolithischen Applikation auf Event-Driven Microservices',
  'Systemdesign für eine hochverfügbare Enterprise-KI-Datenplattform',
];

// Output token estimates per classification (based on typical LLM response lengths)
export const OUTPUT_TOKENS_BY_CLASSIFICATION: Record<string, number> = {
  simple:  120,
  medium:  380,
  complex: 750,
};

// System prompt overhead added to every request (approx.)
export const SYSTEM_PROMPT_OVERHEAD_TOKENS = 180;
