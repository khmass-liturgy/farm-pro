# Graph Report - farm-pro  (2026-11-13)

## Corpus Check
- 40 files · ~91,604 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 1, .css 1, .ico 1)

## Summary
- 787 nodes · 1445 edges · 39 communities (34 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e40ac419`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- programs.js
- drugSearch.js
- preShipment.js
- movePermit.js
- movePermitBulk.js
- vetReport.js
- medicationLog.js
- prescriptions.js
- send_daily_age.py
- clinicalAssessment.js
- kakao.js
- app.js
- rodentControl.js
- batches.js
- breedStandards.js
- steps
- masterdata.js
- vetOfficeInfo
- henShipment.js
- vetDefaultYm
- dashboard.js
- sms.js
- vetEntriesForYm
- supabaseClient.js
- farms.js
- server.js
- schedule.js
- googleDrive.js
- vetParseLedger
- saveVetPhotos
- pbPremium.js
- index.ts
- rxProducts.js
- necropsyReport.js
- reports.js

## God Nodes (most connected - your core abstractions)
1. `vetDefaultYm()` - 15 edges
2. `renderPrograms()` - 12 edges
3. `kakaoSendFarms()` - 12 edges
4. `renderDrugSearchPanel()` - 11 edges
5. `kakaoSendPrintPages()` - 11 edges
6. `sendKakao()` - 11 edges
7. `vetOfficeInfo()` - 11 edges
8. `process_telegram_commands()` - 11 edges
9. `viewProgram()` - 10 edges
10. `vetMonthStats()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `kakaoSendSelectedPrograms()` --indirect_call--> `buildProgramPrintHtml()`  [INFERRED]
  js/programs.js → js/print.js

## Import Cycles
- None detected.

## Communities (39 total, 5 thin omitted)

### Community 0 - "programs.js"
Cohesion: 0.06
Nodes (68): buildProgramPrintHtml(), fitPrintHtmlToOnePage(), printProgram(), addDpDrugSlot(), addDrugSlot(), addFeedSlot(), allowedVaccineSpecies(), applyProgramAutoName() (+60 more)

### Community 1 - "drugSearch.js"
Cohesion: 0.08
Nodes (54): attachDrugDetails(), bindDsearch(), CHOSEONG, choseongMatchIndex(), dropExportOnly(), DRUG_FORM_WHITELIST, DRUG_SPECIES, DRUG_SYMPTOM_ALIAS (+46 more)

### Community 2 - "preShipment.js"
Cohesion: 0.08
Nodes (41): addPsRow(), buildPreShipmentHtml(), buildPsExcelFile(), buildPsFeeSheet(), collectPsRows(), deleteSelectedPreShipments(), editSelectedPreShipment(), kakaoSendSelectedPreShipments() (+33 more)

### Community 3 - "movePermit.js"
Cohesion: 0.11
Nodes (36): buildMovePermitHtml(), collectMpSigns(), deleteSelectedMovePermits(), duplicateMovePermit(), duplicateSelectedMovePermit(), editSelectedMovePermit(), MP_CLINICAL_SIGNS, MP_FORM_TYPES (+28 more)

### Community 4 - "movePermitBulk.js"
Cohesion: 0.11
Nodes (34): RFC-2047, RFC-2231, RFC-822, buildMovePermitsPdf(), buildMpMime(), downloadSelectedMovePermitsPdf(), getGmailAccessToken(), issueMpBulk() (+26 more)

### Community 5 - "vetReport.js"
Cohesion: 0.07
Nodes (32): buildVetDiaryHtml(), editSelectedVetEntry(), onVetContentSelChange(), onVetEntryFarmChange(), openVetEntryModal(), populateVetEntryFarms(), printSelectedVetDiary(), renderVetImportPreview() (+24 more)

### Community 6 - "medicationLog.js"
Cohesion: 0.13
Nodes (27): dayAgeOnDate(), deleteMedicationLog(), deleteViewedConsultLog(), editViewedConsultLog(), isConsultLog(), loadConsultViewPhotos(), loadMlExistingPhotoUrls(), mlPhotoState (+19 more)

### Community 7 - "prescriptions.js"
Cohesion: 0.12
Nodes (30): addRxItemSlot(), buildPrescriptionHtml(), collectRxItems(), deleteRxPrescription(), deleteSelectedRxPrescriptions(), editSelectedRxPrescription(), initRxItemSlots(), onRxFarmChange() (+22 more)

### Community 8 - "send_daily_age.py"
Cohesion: 0.12
Nodes (14): add_exclusion(), candidate_line(), day_age(), extract_name_and_age(), fetch_exclusions(), fetch_programs(), find_candidates(), get_telegram_updates() (+6 more)

### Community 9 - "clinicalAssessment.js"
Cohesion: 0.13
Nodes (28): caBatchLabel(), caDraft, CLINICAL_ITEMS, CLINICAL_MAX, dayAgeOn(), deleteClinicalAssessment(), GRADE_BANDS, gradeBadgeClass() (+20 more)

### Community 10 - "kakao.js"
Cohesion: 0.18
Nodes (28): closeKakaoReady(), fillKakaoFromProgram(), kakaoCardTitle(), kakaoCoverTitleLines(), kakaoErrorMessage(), kakaoFarmLines(), kakaoFarmText(), kakaoFeedPayload() (+20 more)

### Community 11 - "app.js"
Cohesion: 0.14
Nodes (15): boot(), COLLAPSIBLE_SECTIONS, DEFAULT_OPEN_SECTIONS, initSidebarSections(), loadClosedSections(), loadOpenSections(), manualRefresh(), PAGE_ACTIONS (+7 more)

### Community 12 - "rodentControl.js"
Cohesion: 0.16
Nodes (21): deleteRodentAssessment(), openRodentModal(), populateRodentFarmFilter(), printRodentReport(), rcDraft, renderRodentAssessments(), renderRodentInputs(), RODENT_ACTION_MATRIX (+13 more)

### Community 13 - "batches.js"
Cohesion: 0.18
Nodes (16): buildBatchEnvHtml(), computeBatchDisplayStatus(), computeDayAge(), deleteBatch(), deleteSelectedBatch(), editSelectedBatch(), onBatchFarmChange(), onBatchSpeciesChange() (+8 more)

### Community 14 - "breedStandards.js"
Cohesion: 0.10
Nodes (16): ARBORACRES_DATA, BROILER_ENV_BY_BREED, BROILER_ENV_DEFAULT, COBB500_DATA, CONSULT_BREEDS, ENV_SOURCE, HYLINE_BROWN_DATA, HYLINE_W36_DATA (+8 more)

### Community 15 - "steps"
Cohesion: 0.11
Nodes (18): SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, jobs, send, name, on, schedule (+10 more)

### Community 16 - "masterdata.js"
Cohesion: 0.16
Nodes (14): collectDrugTypes(), deleteDrug(), deleteFeed(), deleteVaccine(), DRUG_TYPE_BASE, openDrugModal(), populateDrugTypeFilter(), populateDrugTypeSelect() (+6 more)

### Community 17 - "vetOfficeInfo"
Cohesion: 0.18
Nodes (19): buildVetInvoiceHtml(), buildVetTripHtml(), buildVetWorkReportHtml(), deleteVetWorkEtcSaved(), onVetWorkEtcChange(), openVetOfficeInfoModal(), printVetInvoice(), printVetTrip() (+11 more)

### Community 18 - "henShipment.js"
Cohesion: 0.20
Nodes (17): buildHenShipmentHtml(), deleteSelectedHenShipments(), editSelectedHenShipment(), HS_FIXED, hsNextDocNo(), hsSelectedIds, kakaoSendSelectedHenShipments(), onHsAppliedAtChange() (+9 more)

### Community 19 - "vetDefaultYm"
Cohesion: 0.20
Nodes (18): buildVetDailyHtml(), buildVetPatrolPageHtml(), deleteVetSaved(), openVetSaved(), printAllVetDaily(), printSelectedVetDaily(), printVetDaily(), printVetPatrol() (+10 more)

### Community 20 - "dashboard.js"
Cohesion: 0.21
Nodes (15): computeBreedStandardSummary(), computeEnvStandards(), computeFarmDayAges(), dashWeatherState, envLoadLabel(), FARM_DAY_AGE_SECTIONS, fetchDashboardWeather(), fetchPoultryPrices() (+7 more)

### Community 21 - "sms.js"
Cohesion: 0.28
Nodes (14): buildProgramSmsText(), extractFunctionErrorMessage(), fillSmsFromProgram(), invalidSmsNumbers(), openSmsModal(), parseSmsManualNumbers(), populateSmsProgramSelect(), renderSmsFarmList() (+6 more)

### Community 22 - "vetEntriesForYm"
Cohesion: 0.18
Nodes (14): deleteSelectedVetEntries(), renderVetDaily(), renderVetDiaryList(), renderVetEntries(), saveVetEntry(), saveVetImport(), toggleVetDailySelect(), toggleVetDailySelectAll() (+6 more)

### Community 23 - "supabaseClient.js"
Cohesion: 0.21
Nodes (10): deleteRow(), describeDbError(), editingId, insertRow(), refreshAllStores(), refreshOne(), sb, STORE (+2 more)

### Community 24 - "farms.js"
Cohesion: 0.29
Nodes (9): deleteFarm(), exportFarmsExcel(), farmBreedNameFor(), farmSelectedIds, filteredFarms(), renderFarms(), saveFarm(), toggleFarmSelect() (+1 more)

### Community 25 - "server.js"
Cohesion: 0.31
Nodes (9): byteLength(), handleFetchCustoms(), handleFetchKrei(), handleFetchMafra(), handleSendSms(), http, readBody(), sendJson() (+1 more)

### Community 26 - "schedule.js"
Cohesion: 0.38
Nodes (9): computeEvantTargets(), isCoccidiosisVaccine(), jumpToEvantSchedule(), jumpToFarmSchedule(), loadScheduleForFarm(), populateScheduleSelects(), renderEvantCard(), renderScheduleAlerts() (+1 more)

### Community 27 - "googleDrive.js"
Cohesion: 0.46
Nodes (7): backupPhotosToGoogleDrive(), ensureGDriveTokenClient(), gDriveFindOrCreateFolder(), gDriveFolderCache, gDriveUploadFile(), getGDriveAccessToken(), googleDriveEnabled()

### Community 28 - "vetParseLedger"
Cohesion: 0.36
Nodes (8): loadVetImportSheet(), onVetEntryFile(), vetImpAddDays(), vetImpHeader(), vetImpNorm(), vetImpPeriodStart(), vetParseLedger(), vetXlDate()

### Community 29 - "saveVetPhotos"
Cohesion: 0.43
Nodes (8): moveVetPhoto(), onVetPhotoFiles(), openVetPhotoModal(), removeVetPhoto(), renderVetPhotoGrid(), saveVetPhotos(), vetPhotoEntry(), vetResizeImage()

### Community 30 - "pbPremium.js"
Cohesion: 0.38
Nodes (5): PBPM_CATEGORIES, PBPM_ITEMS, pbpmCategoryOf(), pbpmEsc(), renderPbPremiumPage()

### Community 32 - "index.ts"
Cohesion: 0.40
Nodes (3): ALLOWED_ORIGINS, corsHeaders(), json()

### Community 34 - "rxProducts.js"
Cohesion: 0.60
Nodes (3): deleteRxProduct(), renderRxProducts(), saveRxProduct()

### Community 35 - "necropsyReport.js"
Cohesion: 0.14
Nodes (27): buildNcExcelFile(), buildNecropsyHtml(), deleteSelectedNecropsies(), editSelectedNecropsy(), kakaoSendSelectedNecropsies(), ncEsc(), ncExcelRange(), ncExcelTargets() (+19 more)

## Knowledge Gaps
- **3 isolated node(s):** `RFC-2047`, `RFC-2231`, `RFC-822`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 187 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `RFC-2047`, `RFC-2231`, `RFC-822` to the rest of the system?**
  _3 weakly-connected nodes found - possible missing edges._
- **Should `programs.js` be split into smaller, more focused modules?**
  _Cohesion score 0.060641627543035995 - nodes in this community are weakly interconnected._
- **Should `drugSearch.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07662337662337662 - nodes in this community are weakly interconnected._
- **Should `preShipment.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08080808080808081 - nodes in this community are weakly interconnected._
- **Should `movePermit.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
- **Should `movePermitBulk.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10634920634920635 - nodes in this community are weakly interconnected._
- **Should `vetReport.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07308377896613191 - nodes in this community are weakly interconnected._