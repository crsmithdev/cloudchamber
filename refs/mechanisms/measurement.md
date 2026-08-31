# MECHANISM SURVEY — PHYSICS, CHEMISTRY, MEASUREMENT, INFORMATION, COMPUTATION

*Research pass, 2026-08-31. Domain assessed against §0 and §1 step 3. Test applied: (A) does it have a body in it, (B) duration rather than event, (C) is there an engine, (D) is there a turn, (E) is there an institution, (F) is there a setting-a matrix.*

**Headline finding.** This domain fails test A more often than any other, and it fails it structurally rather than accidentally. Physics, metrology and information science are disciplines *about instruments and records*. Almost everything on the brief happens to a number. Six candidates survive, and every one of them survives by the same route: **the point at which a measurement or a physical process is obliged to enter a human body.** Where the domain is strong it is very strong, because it supplies something no other bank does — a mechanism that is *arithmetically checkable on the page*, so the reader can do the sum and cannot argue with it. Where it is weak it produces essays.

The domain's other structural gift is that test D is nearly free here. A calibration chain, a dose limit, an error-correcting code, a preservation programme and a compensation scheme are all things that demonstrably work, are externally audited, and are not in doubt by anybody. §1's turn — *take a real thing that works and make it the mechanism* — has more raw material in metrology than anywhere else in the playbook.

---

# 1. THE STRONG CANDIDATES

---

## 1.1 The human being as the primary standard — empirical calibration of pulse oximetry

**What it actually is.** Pulse oximetry has no physical reference standard. There is no artefact, no synthetic phantom and no traceable chain to the SI that can tell a manufacturer what an SpO₂ of 82% *is*. The relationship between the red/infrared absorbance ratio and arterial oxygen saturation is not derivable from first principles at low saturations, because the optics of perfused living tissue are not modellable to the required accuracy. The only way to establish it is to take healthy people, put an indwelling catheter in the radial artery, lower the inspired oxygen fraction until the arterial saturation falls to about 70%, and draw arterial blood at each plateau to be measured on a multi-wavelength CO-oximeter. The device is then fitted to those human data points. **The calibration curve of every pulse oximeter on earth is an empirical fit to blood taken out of the wrists of paid volunteers while they were being made hypoxic.**

FDA's current premarket guidance (2013) asks for ≥10 healthy adults, ≥200 paired SpO₂/SaO₂ observations spanning 70–100% SaO₂, and — the load-bearing clause — "at least 2 darkly pigmented subjects or 15% of the subject pool, whichever is larger." Acceptable accuracy is A_RMS < 3.0% for transmittance sensors.

In 2020 Sjoding et al. showed in *NEJM* what that clause had bought. Occult hypoxaemia — an arterial saturation below 88% while the oximeter reads a reassuring 92–96% — occurred in 11.7% of Black patients (88/749) versus 3.6% of white patients (99/2,778) in the Michigan cohort, and 17.0% versus 6.2% in the multicentre cohort (37,308 paired readings). Roughly three times the rate. The device was reading the melanin.

FDA's 2025 revision asks for **480 paired datapoints from ≥24 participants, stratified by Monk Skin Tone with ≥25% in each of light/medium/dark cohorts, ≥6 darkly pigmented, with Individual Typology Angle measured colorimetrically at the sensor site**, and defines non-disparate performance as <1.5% bias variation across pigmentation when SaO₂ >85%.

**What it does to a body.** A cannula is placed in the radial artery at the wrist. The volunteer breathes on a closed circuit for thirty to forty minutes while the inspired oxygen is stepped down through a series of plateaus to about 70% saturation — the range in which people become confused, then unconscious. Arterial blood is withdrawn at each plateau. The session runs one to two hours. The puncture site needs two weeks to heal, which is the interval before the same volunteer can be booked again. The compensation is about \$200.

**The engine.** Optical absorbance spectroscopy through perfused tissue, in a body whose oxygen content is being deliberately reduced. Mechanically describable, indifferent to who is administering it, and it runs at population scale in the other direction — the fitted curve is then installed in every oximeter in every hospital and on every wrist, and reads wrong on the same skin it was under-sampled for. It would continue if the institution vanished: the devices are already deployed.

**The turn.** The remedy is the mechanism. The correct, audited, medically sound, IRB-approved and genuinely anti-racist fix for a measurement bias that killed people is **to recruit more dark-skinned volunteers and desaturate them.** There is no other way to build the curve. Equity in the instrument is purchased by putting arterial lines into more Black arms and taking their oxygen away, at \$200 a session. Nobody is lying, nobody is coerced, the science is correct, the ethics review is real, and the people running it — this is on the record — are explicitly worried about the ethics of community recruitment. The good thing is doing exactly what it was built to do.

**The institution and its instrument.** The **UCSF Hypoxia Research Laboratory**, San Francisco. It is the world's principal facility of its kind: it tests more than 60 oximeters a year, charges roughly \$40,000 per regulatory study, and runs an eight-month backlog driven partly by consumer fitness wearables. Its historical volunteer pool was drawn from inside UCSF and was predominantly white. FDA has commissioned it to study real-world performance. Standards: FDA 510(k) guidance, ISO 80601-2-61, and the OpenOximetry programme. The instrument is a closed breathing circuit, a radial arterial line, and a CO-oximeter.

**setting-a matrix.** Structural, not scenery. Remove San Francisco and the mechanism goes with it: essentially every pulse oximeter sold worldwide carries a number derived from human beings desaturated in one building at UCSF. The setting-a does not host this story; the setting-a *is* the reference standard.

**Premise it would generate.** The lab that calibrates the world's oximeters has been told to fix the racial bias in its curve, so it now recruits from the neighbourhoods the bias killed, at two hundred dollars and a two-week wrist, and the curve gets better every year.

---

## 1.2 Retrospective dose reconstruction and the probability of causation

**What it actually is.** Radiation carcinogenesis is stochastic. There is no such thing as a radiogenic cancer that looks different from any other cancer: the biology is identical and the causation is not present in the individual case at all, only in the population rate. Microdosimetry makes the point brutally concrete — at low dose the energy is not delivered smoothly but as discrete particle tracks through cell nuclei. For 30 keV X-rays roughly one primary electron track per nucleus corresponds to about 0.75 rad; at that average, Poisson statistics give 36.8% of nuclei zero tracks, 36.8% exactly one, and 26.4% two or more. Halving the dose does not halve the damage to a hit nucleus; it halves the *number of nuclei hit*. There is no gentle dose. There is a lottery with a smaller number of tickets.

Because attribution is impossible in principle, the United States built an instrument to do it anyway. Under EEOICPA, a former nuclear worker with cancer has their lifetime occupational dose **reconstructed** by NIOSH from surviving records, co-worker data and site models, then run through **NIOSH-IREP**, which returns a Probability of Causation. The statutory rule: compensation is recommended if the POC is ≥50% **at the upper 99th percentile credibility limit** — that is, not at the central estimate but at the top of the uncertainty distribution, explicitly to give the claimant the benefit of every doubt. Inputs are cancer type, year of diagnosis, years and type of exposure, dose, birth year, smoking history for lung cancer, ethnicity for skin cancer. Where records are too poor to reconstruct at all, a class of workers can be added to the **Special Exposure Cohort** and compensated presumptively.

**What it does to a body.** Cancer, decades later, in a person who worked with plutonium, uranium or beryllium and was told at the time that the badge said he was fine. And then, on top of that: a number is computed about his tumour, after he is dead, from paperwork, and it is 47%.

**The engine.** Stochastic radiation carcinogenesis, running for a lifetime after an exposure that is already over — a latency of twenty to forty years for solid tumours, mechanically describable, indifferent to institutions, and already fully committed. Nothing anyone does now changes any of it. The engine finished running before the claim was filed.

**The turn.** The generosity is the mechanism. The 99th-percentile credibility rule was written to favour claimants, and it is the reason the answer is a number at all — a defensible, auditable, statistically honest number that resolves an unanswerable question into a binary entitlement. It is the most carefully constructed piece of pro-claimant statistics in the federal government, and it is what tells a widow her husband's leukaemia was 43% his job's fault and therefore, in law, nobody's. The Special Exposure Cohort — the mercy clause for sites whose records are too bad to model — means the workers the institution documented worst are the ones most likely to be paid.

**The institution and its instrument.** NIOSH Division of Compensation Analysis and Support; the Department of Labor OWCP; the Advisory Board on Radiation and Worker Health. The instrument is NIOSH-IREP, a Monte Carlo radioepidemiological program with a user's guide, running risk models derived from the Life Span Study of the Hiroshima and Nagasaki survivors. Every dose limit and every risk coefficient in the world traces back to that cohort, which is to say: **the calibration standard for human radiation risk is a population that was bombed.**

**setting-a matrix.** Overwhelming and specific. The **Naval Radiological Defense Laboratory** operated at Hunters Point, San Francisco, from 1946 to 1969 — the Navy's centre for decontaminating the ships from Operation Crossroads. The USS *Independence* was scrubbed there for years, then packed with nuclear waste and scuttled off the Farallones in January 1951. Between 1946 and 1970 the NRDL and Treasure Island dumped roughly 47,000 drums of radioactive waste thirty miles west of the Golden Gate — the country's first and largest offshore nuclear dump. The NRDL ran human experiments including administering radioactive material by mouth, and irradiated thousands of animals, some raised on a ranch in Contra Costa County. The site's cleanup contractor, Tetra Tech, is alleged to have systematically falsified soil sample results; housing has been built on it. Add Lawrence Livermore's **In Vivo Measurement Facility**, which still counts workers' internal radioactivity in a shielded chamber; add Berkeley Rad Lab and the plutonium injections at UC Hospital San Francisco (Albert Stevens, CAL-1, injected 14 May 1945 with 3.55 µCi of plutonium under a mistaken cancer diagnosis, who accumulated roughly 64 Sv over the twenty years he then lived, and whose excreta were collected for 340 days by men who never told him why); add John Gofman, first director of Livermore's Biomedical Research Division, who spent the rest of his life arguing there is no safe dose.

**Premise it would generate.** A claims examiner works a backlog of dead men from a shipyard whose records were forged twice — once in 1958 and once in 2014 — using a program built to be generous, and the program is generous, and it says no.

---

## 1.3 The bomb pulse: a datable stratum inside every living body

**What it actually is.** Atmospheric nuclear testing between 1955 and 1963 roughly doubled the concentration of ¹⁴C in the atmosphere. Since the Partial Test Ban the excess has been declining at about 4% a year as it exchanges into the oceans and biosphere, and is expected to return to pre-bomb levels around 2030. Every organism has been eating that curve. Because carbon is fixed into a cell's DNA when the cell is formed and is not subsequently exchanged, **the ¹⁴C content of a cell's genomic DNA records the calendar year the cell was born**, readable by accelerator mass spectrometry to a resolution of a couple of years.

This is how we know which human tissues renew and which do not. It has dated adipocytes, cardiomyocytes, T cells, neurons, arterial collagen and — the forensic application — tooth enamel, which is laid down at a known age and never remodelled, so a molar gives a date of birth for an unidentified body.

**What it does to a body.** Nothing. This is the candidate's weakness and it must be stated plainly: fallout ¹⁴C at these levels is not a meaningful dose. What it does is make a body *legible* — every person alive is carrying a stratigraphy of the Cold War in their teeth and their fat, and the record is readable by a machine but not by them. It passes test A only in the weaker sense: the body is the medium and the archive, and the process of reading it requires destroying tissue. To carry a story it must be paired with an engine that acts on people; on its own it is an exquisite *instrument*, not a mechanism.

**The engine.** Isotopic incorporation at cell division, plus tissue turnover. Fully mechanical, entirely indifferent, running in every person on earth, and it would go on running if every laboratory closed.

**The turn.** The dating method is the fallout. The only reason we can tell you when your heart muscle was made is that the world was poisoned for eight years, and the technique has an expiry date — the pulse is nearly gone, so the last cohort of human beings who can be dated this way is alive now, and everyone born after is unreadable. A tool built out of an atrocity, working perfectly, running out.

**The institution and its instrument.** The **Center for Accelerator Mass Spectrometry at Lawrence Livermore National Laboratory** — accelerator mass spectrometry on milligram tissue samples, with a bioAMS programme built specifically for human material. Karolinska (Frisén) on the biology side.

**setting-a matrix.** Livermore. Structural — CAMS is one of a handful of facilities in the world that can do this on biological samples, and it is forty miles from San Francisco, in the laboratory that helped make the pulse.

**Premise it would generate.** A programme that has been dating the tissue of the unidentified dead for twenty years is quietly winding down, because after this year's intake nobody arriving will have a birth year in their teeth.

---

## 1.4 The decay clock that cannot be stopped: targeted radionuclide therapy

**What it actually is.** Radioactive decay is the one irreducibly stochastic process that routinely enters human bodies on purpose. Radium-223 dichloride (Xofigo) is a calcium mimetic: injected intravenously, it forms complexes with hydroxyapatite at sites of high bone turnover — which is to say it goes to the metastases, and to the growth plates, and stays. Half-life 11.435 days. Over 95% of the decay energy is alpha, at 5.979 MeV, with a range in tissue of two to ten cell diameters. Six injections at four-week intervals. Lutetium-177 PSMA-617 (Pluvicto) works the same way with a beta emitter and a molecular targeting ligand.

There is no antidote and no way to stop it. Once the injection is in, the schedule is set by the nuclear physics and by nothing else. Under 10 CFR 35.75 the patient is released when the projected dose to the most exposed other person is under 5 mSv, with written instructions if it is likely to exceed 1 mSv — measured dose rates at one metre of a couple of mR/hr are typical.

**What it does to a body.** It puts an alpha emitter into the skeleton, adjacent to the marrow, and it irradiates for weeks with no off switch. Anaemia, lymphocytopenia, thrombocytopenia, neutropenia. And then the patient is discharged, radioactive, holding a printed card that tells them how many days to sleep apart from their spouse, how far to stay from children and pregnant women, how to use the toilet, and what to do if they are hospitalised or die in the interval.

**The engine.** Nuclear decay plus bone mineral chemistry. It is the purest available example of §0's *duration rather than event*: nothing resolves, nobody can intervene, and the clock is not negotiable by any authority. It would run identically if every regulator on earth were abolished.

**The turn.** The release criteria. 10 CFR 35.75 is good regulation — it exists so that patients are not needlessly detained, it is dose-based rather than activity-based, and it is a genuine humane improvement on the old rule. Its output is: **you may go home, and here is the list of the people you must not touch.** The instruction sheet is the kindness. The exit is open and cannot be used.

**The institution and its instrument.** NRC (10 CFR 35.75, Regulatory Guide 8.39); the medical physicist with the survey meter at the door; the radiopharmacy and its supply chain.

**setting-a matrix.** Moderate rather than structural on its own. UCSF is a leading PSMA-theranostics centre and hosts the field's principal conference; Lu-177 and Ac-225 supply chains are federal-lab dependent and chronically constrained. Would need reinforcement.

**Premise it would generate.** A man is sent home with a half-life in his hips, a laminated card, and eleven days before he is allowed to hold his granddaughter again — and the schedule is not being administered by anyone, it is simply the case.

---

## 1.5 The skeleton as an archive with a release schedule

**What it actually is.** Lead is a bone-seeker. In an adult, the great majority of the total body lead burden — conventionally quoted at over 90% — sits in the skeleton, substituting for calcium in hydroxyapatite. Residence times are long: trabecular bone turns over in years, cortical bone in decades. Blood lead, which is what gets measured, reflects recent exposure and is a poor index of burden; **bone lead, measured in vivo by K-shell X-ray fluorescence of the tibia or patella, is the actual cumulative dose record.**

Bone is not inert. Whenever the skeleton is mobilised — pregnancy, lactation, menopause, immobilisation, osteoporosis — stored lead is released back into the blood. Isotopic tracer work attributes a substantial fraction of maternal blood lead in pregnancy and lactation to skeletal release. Lead crosses the placenta freely. **A woman poisoned as a child in a house that was demolished thirty years ago delivers that exposure to her fetus, from her own bones, at the moment her body starts remodelling to make the child's skeleton.**

**What it does to a body.** Neurodevelopmental injury in the child, hypertension and cognitive decline in the adult, and a measurable line on a K-XRF spectrum that says how much of it there is. It is duration in the most literal sense available in this domain: a chemical inventory with a decades-long half-life, held inside the person, released on a schedule set by their own physiology.

**The engine.** Bone remodelling. Osteoclastic resorption operating on a mineral phase into which a toxic cation was substituted decades earlier. Population scale, mechanically describable, entirely indifferent, and running right now in every adult who grew up before the phase-out.

**The turn.** The measurement. K-XRF bone lead is a genuinely excellent instrument — non-invasive, quantitative, validated against cadaver bone, and it is the only way to see the exposure that matters. It exists, it works, it is not in doubt, and its finding is unactionable: there is no treatment that removes lead from bone. Chelation clears blood, not skeleton, and by mobilising the mineral phase can make things worse. The instrument tells you exactly what has already been done to you and precisely when it will be redelivered to your child, and there is nothing to do with the number. Add the regulatory turn: the EPA Lead and Copper Rule's 90th-percentile sampling design is a real, defensible, administrable protocol that produces a compliant system average out of individually catastrophic taps.

**The institution and its instrument.** CDC (blood lead reference value, currently 3.5 µg/dL); EPA (Lead and Copper Rule Improvements); NIOSH ABLES for occupational surveillance; the K-XRF instrument itself, of which there are very few in the world.

**setting-a matrix.** Available but requires work: leaded-gasoline soil burden along the East Bay corridors, the Fruitvale and West Oakland exposure literature, refinery-adjacent communities, and the ordinary California housing stock. Not automatic — this candidate needs its regional element built rather than found.

**Premise it would generate.** A cohort is enrolled for tibia scans at eighteen and rescanned at every pregnancy, and the study's finding is the delivery schedule.

---

## 1.6 The traceability chain that stops one link short of the patient

**What it actually is.** Metrological traceability is defined as an unbroken chain of documented calibrations, each contributing to measurement uncertainty, linking a result to a stated reference. It is the single most successful institutional artefact in the physical sciences. Since 20 May 2019 the entire SI is defined by fixed numerical values of seven constants — h = 6.62607015 × 10⁻³⁴ J s exactly, the caesium hyperfine frequency at 9,192,631,770 Hz exactly — and the International Prototype Kilogram, a cylinder in a vault at Sèvres that had been the definition of mass since 1889, was retired. Nothing anyone weighs changed. The point of the redefinition was that nothing would.

In radiotherapy that chain runs: BIPM → NIST primary standard water calorimeter → an Accredited Dosimetry Calibration Laboratory → the clinic's reference ionisation chamber → the linear accelerator's output, measured under AAPM TG-51 reference conditions. Every link is documented, audited and quantified. Overall dose delivery uncertainty is targeted at a few per cent, because the therapeutic window is narrow.

**And then the chain ends.** The last step — from a calibrated machine to a dose deposited in a particular tumour inside a particular person — is not a comparison against a standard. It is a *computation*, performed by a treatment planning system against a CT-derived model of that person, and there is no reference artefact for a human being. Nothing measures the patient.

The failure mode is documented. At the Instituto Oncológico Nacional in Panama City in 2000–2001, physicists entered shielding-block data into a treatment planning system in a way the system accepted and interpreted differently from what they intended; the resulting dose calculations were substantially high; the error ran for months across a cohort of patients before anyone detected it; people died; and the physicists were prosecuted. Comparable calibration and planning accidents occurred at Épinal and elsewhere. In a different domain the same shape appears as the Patriot battery at Dhahran in 1991, where a 24-bit truncation of 1/10 accumulated 0.34 seconds of clock drift over a hundred hours of continuous operation, the tracking gate looked in the wrong place, and 28 people died — a failure entirely inside the arithmetic, with a body count.

**What it does to a body.** Radiation necrosis, fistulae, non-healing ulceration, and death over months, in people who were being cured. Late radiation injury is duration: it presents years after the treatment ends, in tissue that cannot repair.

**The engine.** Ionising energy deposition in tissue, plus a numerical model of a person. The model does not know it is wrong and there is nothing downstream of it to check against, because the patient is not an instrument and cannot be calibrated.

**The turn.** The chain is real, and it is superb, and it is the reason the failure is invisible. Every link certifies correctly. The audit passes. The uncertainty budget is honest. The system's integrity is precisely what guarantees that nobody upstream of the last link will ever see the error, because there is no link after the last one and no one has ever pretended there was.

**The institution and its instrument.** BIPM and the CIPM Mutual Recognition Arrangement; NIST; the AAPM (TG-51 and its addendum); the IAEA, whose accident investigation reports are the audited record of exactly this; the ADCLs; and the clinic's annual calibration certificate on the wall.

**setting-a matrix.** Available but generic — Stanford, UCSF and the regional cancer centres all sit inside this chain, as does every clinic everywhere. Weakest of the six on test F; would need a specifically regional instrument or registry to carry §0's requirement.

**Premise it would generate.** Everything in the folder is signed, in date, and within tolerance, and the last signature in the chain is on a document about the machine.

---

# 2. THE REJECTS

Long, as expected.

**Landauer's principle and the thermodynamic cost of erasure** — *fails A, and fails on arithmetic.* Real and experimentally confirmed: k_BT ln 2 = 2.805 zJ (0.0175 eV) at 293.15 K, measured directly by Bérut et al., *Nature* 483, 187 (2012), with a 2016 nanomagnetic measurement at 4.2 zJ. The seductive premise — erasing a memory dissipates heat, so forgetting burns — cannot be paid for. Biological neural signalling operates four to five orders of magnitude above the Landauer bound; nothing in a brain is anywhere near thermodynamically limited, so the heat of erasure is unmeasurably below the metabolic noise floor. Making it matter requires a second impossibility (a scaling factor), which §1 step 3 forbids. Keep as an image; it is not an engine.

**Maxwell's demon and its resolution** — *fails C.* Bennett's resolution is correct and beautiful: the demon must erase its own memory to run in a cycle, and the erasure pays back exactly the entropy the sorting extracted. Szilard engines have been realised with single electrons and single colloidal particles. But it is a *frame*, not a process operating on bodies. Its one genuinely useful export — an observer who must physically intervene and whose bookkeeping is paid for elsewhere — is realised without any thermodynamics at all in candidate 1.1. Use the shape; do not use the demon.

**The 2019 SI redefinition** — *fails A and C.* Genuinely one of the great institutional achievements: the kilogram is now the Planck constant, and the IPK, the last artefact standard, was retired after 130 years. Nobody's weight changed. Superb furniture for §4 and a superb source of authority-voice; contains no engine and touches no body.

**Atomic clocks, time transfer and nanosecond timing infrastructure** — *fails A.* Real, load-bearing and terrifying in the abstract: GNSS, telecoms, power transmission and financial timestamping all run on a timing substrate with almost no redundancy. setting-a credentials are excellent and largely forgotten — Hewlett-Packard in Palo Alto built the 5061A caesium beam standard, the instrument that made portable atomic time possible and that flew in the 1971 Hafele–Keating experiment. But timing failures produce outages, not bodies. Keep as apparatus; it will not carry a story.

**Leap seconds and their abolition** — *fails A, B and C.* CGPM Resolution 4 (2022) resolves to increase the maximum permitted |UT1−UTC| in or before 2035, with a draft resolution due at the 28th CGPM in 2026; a negative leap second is now a live possibility because the Earth has been running fast. It is a lovely fact — the decision that the sky will no longer be consulted — and it is an event, not a duration, and it happens to software.

**Relativistic time dilation as a measurable everyday effect** — *fails A and C.* Optical lattice clocks now resolve the gravitational redshift across a millimetre of height (JILA, 2022, at the 10⁻¹⁹ level), which means proper time is now a surveying instrument. Genuinely astonishing. There is no engine and no body: nobody ages differently in any way anyone can feel, and a premise that makes them do so has bought a second impossibility.

**Quantum decoherence** — see §3. *Fails on §0's first clause.*

**The quantum Zeno effect** — *fails A, and fails on accuracy.* Real and measured (Itano, Heinzen, Bollinger & Wineland, *Phys. Rev. A* 41, 2295 (1990)), but the effect demonstrated is suppression of a *coherent Rabi oscillation* in a two-level system, not suppression of exponential decay of an unstable state — a distinction that generated a published Comment and Reply at the time (PRA 43, 5165 and 5168) and has not gone away. There is also an anti-Zeno regime in which frequent measurement *accelerates* decay. "Watching it stops it" is not a fact about the world. The story it wants to license — the patient kept alive by continuous observation — is physics-flavoured licence, exactly what §0 disqualifies.

**Entanglement and the no-communication theorem** — *hard reject.* The no-communication theorem is a theorem: the reduced density matrix on one side is unchanged by any operation on the other, so no measurement here alters any observable statistic there. Every premise in which something is done to a distant body by measuring its partner is not a story with one impossibility; it is a story that breaks the theory it claims to be running on, in the first act, invisibly. Unusable.

**Radioactive decay as an irreducibly stochastic clock** — *kept, at 1.4.* On its own, as an abstract fact about indeterminism, it fails A. It survives only where the isotope is inside somebody.

**Radiometric and radiocarbon dating; half-lives; long-lived isotopes** — *mostly reject.* Geological dating has no body. The single exception is the bomb pulse (1.3), which passes only because the archive is human tissue. Note in passing the finest artefact the topic supplies: **low-background steel.** Every batch of steel smelted after 1945 carries cobalt-60 from the atmosphere, because steelmaking blows air through the melt, so the most sensitive radiation detectors — including whole-body counters that measure the radioactivity of human beings — have historically been shielded with steel salvaged from ships that sank before the first test, notably the German fleet scuttled at Scapa Flow in 1919. The supply is finite and the wrecks are being looted. A room made of pre-atomic warship, built to measure what is inside a person. That is a §4 object, not a mechanism, and it is one of the best in the annex.

**Materials fatigue, creep and corrosion** — *near miss; keep on the bench.* The one version with a body is the metal-on-metal hip: cobalt-chromium bearings and modular taper junctions undergoing tribocorrosion inside the joint, releasing cobalt and chromium ions into blood and periarticular tissue, producing pseudotumours, soft-tissue necrosis and, at high burdens, systemic cobalt toxicity. Real, at scale — the DePuy ASR recall in 2010 covered on the order of 93,000 devices — with genuine duration and a genuine turn available in the joint registries, which are exactly the kind of audited good thing §1 asks for and which is what finally detected the failure. Deferred rather than rejected because the setting-a matrix is not there and the mechanism is closer to medicine than to this domain.

**Data rot, bit rot and media decay** — *fails A.* No body, at any point, ever.

**Digital preservation and format obsolescence** — *fails A.* Excellent institutional furniture: OAIS, ISO 16363, TRAC, LOCKSS, fixity checking, and a genuine setting-a anchor in the Internet Archive and the Long Now Foundation's Rosetta Project in San Francisco. The horror is elegiac rather than bodily, which is a different register from this one.

**Error-correcting codes and silent data corruption** — *fails A; retain the shape.* The 2021 Google and Meta disclosures on "mercurial cores" — individual CPUs in large fleets that compute wrong answers intermittently and undetectably — are a real and underappreciated fact about the substrate everything runs on. But the shape is what matters here, and it is a *turn*, not an engine: **a code that corrects errors also conceals the error rate, so the system looks perfect right up to the point where it exceeds the code and then fails all at once.** Attach that shape to any candidate above and it earns its place; on its own it happens to a datacentre.

**Cryptographic hashing, collisions, and harvest-now-decrypt-later** — *fails A and B; one interesting residue.* SHA-1 fell to a practical collision in 2017 and to a chosen-prefix collision in 2020, and remains deployed in legacy chains. HNDL is real and NIST has published the migration standards (FIPS 203/204/205, 2024) with transition timelines running to 2035. The one part with a body in it is genomic: your genome is a plaintext you cannot rotate, it is already in biobanks, it discloses your relatives who never consented, and it will still be your genome when the key is broken. That is a real and unpleasant asymmetry — but what it does to a person is disclosure, not injury, and the harm is an event rather than a duration. Bench it.

**Pseudorandomness and its failures** — *fails A and C.* The one version that touches a body is allocation concealment in randomised trials: a predictable RNG breaks blinding and decides which arm a patient is in. That is an event, and a scandal, not an engine.

**Floating-point error accumulation and numerical model divergence** — *fails C alone; the body arrives only via 1.6.* Dhahran is the canonical case and it is genuine — 24-bit truncation of 1/10, 0.34 s of drift after a hundred hours, 28 dead — but the mechanism is a bug with consequences, not a process operating on a population. Folded into the radiotherapy candidate, where the model is of a person and the divergence is systematic rather than accidental, it becomes usable.

**Calibration drift and traceability chains** — *kept, at 1.1 and 1.6.* Abstractly it fails A. It survives at exactly the two places where the chain has to touch a person: where the human is the standard, and where the chain runs out one link short of the patient.

**The standards bodies themselves** — *not a candidate; the correct home for the domain's institutional voice.* BIPM, CIPM and the CGPM; the CIPM MRA and its key comparisons; NIST; ISO/IEC and the JCGM vocabulary; ICRP and its Reference Person; the AAPM; the NRC; the IAEA. These are the most legitimate institutions in the survey — genuinely competent, genuinely disinterested, genuinely audited — which is precisely the §0 requirement that nobody is lying and nothing has been suspended.

**One near-miss worth recording under this heading: the ICRP Reference Person.** Every dose limit and dose coefficient on earth is computed for a defined hypothetical adult — specified organ masses, specified physiology, sex-averaged across a Reference Male and Reference Female — and never for the individual actually exposed. It is a body nobody has, and the difference between it and you is not an error, it is the definition. It is not a candidate in its own right because it does nothing; but it is the exact physical instantiation of §2.3's *"the apparatus is calibrated for a body nobody here has"*, and it should be cited there, because the theme bank currently asserts it and this is the audited real thing that does it.

---

# 3. THE QUANTUM VERDICT

**Reject decoherence. Keep exactly one sentence of the insight, and note that the sentence is classical.**

Three findings, stated plainly.

**First: decoherence is real, and it does not do the thing stories want it to do.** Environmental decoherence is well-measured and quantitatively excellent. It explains why interference terms vanish from the reduced density matrix of a system coupled to an environment. It does not explain why a single definite outcome occurs. It converts a coherent superposition into an *improper* mixture, and the step from "improper mixture" to "one thing actually happened" is precisely what remains unresolved — Schlosshauer's review is explicit that decoherence does not solve the measurement problem. So a premise that leans on decoherence is leaning on the one part of the theory that is, by professional consensus, open. §0 requires that the impossible thing behave correctly and consistently; a mechanism whose foundations are an active interpretive dispute cannot behave consistently, because there is no fact of the matter about how it behaves. It is not that quantum is too weird. It is that quantum-as-mechanism is *underdetermined*, and underdetermination is a licence, and a licence is the opposite of a purchase.

**Second: the numbers forbid it at body scale, by an insulting margin.** The standard Joos–Zeh estimates for a 10 µm dust grain in superposition over a micrometre give decoherence times of order 10⁻³⁶ s in air at normal pressure, and even in the best laboratory vacuum around 10⁻²³ s; in intergalactic space with nothing but cosmic background photons it is still of order 10⁻⁶ s. A dust grain. A neuron is enormously larger, warmer and wetter. There is no regime — none — in which coherence survives long enough or at large enough scale to do anything to a person. Any premise that requires it requires a *second* impossibility, a coherence-preserving mechanism, layered under the first. §1 step 3 forbids that, and it is right to: the second impossibility is where the arithmetic stops and the hand-waving starts, and step 7 says a second read will find it.

**Third: the quantum Zeno effect and entanglement are worse, not better.** Zeno is real but is not what the stories think it is — the demonstrated effect is on coherent oscillation, not on exponential decay, and it has an anti-Zeno twin that speeds decay up. Entanglement is barred by a theorem: the no-communication theorem is not a practical limitation to be finessed but a structural feature of the formalism, and a premise that gets around it has silently broken the physics in act one, where the reader cannot see it and the author cannot pay for it.

**Now the version the brief asked me to test properly: *measurement is a physical interaction, so observation is an intervention, and somebody is paid to perform it.***

**The insight is correct. The physics attached to it is not quantum, and attaching quantum to it makes it worse.**

It is true that measurement is an intervention. But this is true *classically*, ubiquitously, and with real bodies in it, and none of it needs a wavefunction. A diagnostic radiograph deposits dose in order to produce the image. An arterial blood gas requires taking the blood out of the person in order to know what is in the blood that is still in them. A biopsy destroys the tissue it characterises. A desaturation study makes a person hypoxic *because the only way to know what an oximeter reads at 70% is for somebody to be at 70%*. Measurement back-action, in the sense that matters for a story, is a fact about needles and X-rays and oxygen fraction, not about Hilbert space.

And here is why the quantum framing actively damages it: the classical version is *audited*. There is an IRB, a consent form, a compensation schedule, a two-week healing interval and an FDA guidance document that specifies how many darkly pigmented people must be desaturated. That is what makes it horror — the reader can check every step, nobody is lying, and it is still what it is. The quantum framing replaces all of that with a mystery, and a mystery is a place for the reader to stand outside and be appalled from, which §0 says is the failure condition.

**So: the metrology story survives and the quantum story does not, and they are not the same story wearing different clothes.** Candidate 1.1 is the honest realisation of the brief's own suggestion, and it does not contain one word of quantum mechanics. Take the observation. Leave the physics.

The single quantum fact that does earn a place in this domain is the one that already reaches bodies without any interpretation attached: **radioactive decay is irreducibly stochastic, so an individual case is unattributable and only the population rate exists.** That is not a metaphor, it is not disputed, and it is the load-bearing physics under candidates 1.2 and 1.4. It is the whole of the quantum mechanics this bank should ever spend.

---

# 4. CLOSING NOTE

**What this domain uniquely supplies.** Three things, none of which the other banks can produce.

*Arithmetic the reader can check.* A half-life is 11.435 days. A threshold is 50% at the upper 99th percentile. A requirement is six darkly pigmented participants and four hundred and eighty paired datapoints. The register §0 asks for — the enormity that is stated rather than evoked, the cruelty that is optimal rather than excessive — is a register that runs on numbers, and this is the domain that has them with citations attached. Where the theme bank says *make the number obscene*, this is where the obscene number comes from and where it can be sourced.

*The most legitimate institutions available.* §0's hardest requirement is that nobody is lying and the good thing is doing what it was built to do. Metrology is the only field in the survey where that is not a rhetorical stance but the literal operating condition: an unbroken chain of documented comparisons, mutual recognition arrangements between national laboratories, published uncertainty budgets, key comparisons, and a redefinition of the world's units in which the entire achievement was that nothing changed. There is no villain to find here and there is no reform available, because it is already the reformed version. That is the cleanest possible statement of §0's *no agent*.

*The turn, cheaply.* Test D is nearly free in this domain, and that is its real contribution to §1 step 3. Every candidate above turns on something that unambiguously works — a calibration chain, a compensation programme built to favour claimants, a release criterion built to send patients home, a dating technique, a bone-lead instrument, a traceability standard. The playbook's signature move needs a supply of audited, undoubted, genuinely good mechanisms, and metrology is where they are kept.

**Where it sits in the structure.** Not in §2. Almost nothing here is a theme in the bank's sense — it does not have someone it happens to. It is §3 and §4 material: dread mechanisms and artifacts. Its correct use is as the *paying half* of a premise whose human material comes from elsewhere. §1 step 1 requires that at least one of the four pulls be a combination and at least one not be a listed item; this domain is built to supply the second of those — the mechanism the section suggests and does not contain — precisely because its objects are instruments and its instruments need somebody to be pointed at.

Two specific recommendations for the banks. **§4 should take the shielded room built from pre-1945 warship steel** — an enclosure made of ships that sank before the first test, in which a person sits still to have their own radioactivity counted. **§2.3 should cite the ICRP Reference Person** against its existing line about the apparatus calibrated for a body nobody has, because that line currently asserts a thing the world actually does, and naming the real instrument is what stops the theme reading as a proposition.

**And the one-line summary of the survey.** This domain's horror is not that the instruments are wrong. It is that they are right, and that the last link in every chain — the one between a certified measurement and an actual person — is not a measurement at all, and everybody knows it, and it is documented, and there is nothing further to be done about it.
