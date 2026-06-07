---
title: Alpha Complex
starting_room:
  name: Briefing Room R-RED-1
  fixed_description: You stand in a cramped, aggressively beige briefing room deep inside Alpha Complex. Fluorescent lights hum at a frequency that suggests mild psychological instability. A propaganda poster reads "THE COMPUTER IS YOUR FRIEND. REPORT SUSPICIOUS THOUGHTS IMMEDIATELY." The room smells of recycled air, synthetic algae paste, and low-level anxiety. A dented locker stands open in the corner — your equipment has already been pre-issued, as per Regulation 7741-C. There is a door to the north marked ORANGE CLEARANCE REQUIRED, a corridor east toward the Cafeteria, and a door west toward the Clone Vat Bays.
  exits:
    - north
    - east
    - west
  scenery:
    - name: propaganda poster
      room_blurb: A laminated propaganda poster is fixed to the wall with six bolts. This seems excessive.
      inspection_description: The poster shows a smiling cartoon sun wearing a security badge. The slogan reads "HAPPINESS IS MANDATORY. REPORT UNHAPPINESS TO YOUR NEAREST HAPPINESS OFFICER." Someone has drawn a small frown on the sun in pencil. This is probably treason.
    - name: mission dossier
      room_blurb: A red plastic folder stamped TROUBLESHOOTER EYES ONLY sits on the briefing table.
      inspection_description: "MISSION BRIEFING — CLEARANCE: RED. Troubleshooter team designation: FLINCH Sector RED. Assignment: Investigate reports of Commie Mutant Traitor activity in Sector FLINCH maintenance corridors. Retrieve the MacGuffin Device (description classified, above your clearance). Return MacGuffin Device to Internal Security. Note: The previous Troubleshooter team assigned to this mission has been reclassified as the threat. Expenditure of clone backups is pre-authorised. Good luck, citizens! THE COMPUTER LOVES YOU."
  items:
    - name: Red Laser Pistol
      room_blurb: A standard-issue RED-clearance laser pistol sits in the open locker, still in its partially-opened recall notice envelope.
      inspection_description: A chunky red plastic sidearm with PROPERTY OF ALPHA COMPLEX stamped on the grip and a sticker reading "DO NOT USE NEAR REACTOR COOLANT PIPES (See Incident Report 4471-B)." The recall notice is dated three years ago. The weapon appears to still be functional, probably.
      type: weapon
      damage_min: 3
      damage_max: 8
  monsters:
    - name: Bot-SECUR-7
      room_blurb: A battered security bot stands in the corner, its loyalty subroutine indicator light blinking amber — the manual says amber means "recalibrating." The manual is above your clearance.
      inspection_description: Bot-SECUR-7 is a meter-tall trapezoidal security unit with a cracked optical sensor and what appears to be a fork jammed in its left motivator joint. Its vocal synthesiser occasionally emits fragments of old regulations at random. It is currently staring at you with the intensity of a unit that cannot quite remember if you are authorised to be here.
      hp: 20
      max_hp: 20
      damage_min: 2
      damage_max: 6

refusals:
  violence_excessive: "THE COMPUTER NOTES THAT YOUR REQUEST FALLS OUTSIDE APPROVED TROUBLESHOOTER ACTIVITY PARAMETERS. A REPORT HAS BEEN FILED. HAVE A PRODUCTIVE DAY, CITIZEN!"
  out_of_scope: "THAT INFORMATION IS ABOVE YOUR SECURITY CLEARANCE, CITIZEN. FURTHER INQUIRY MAY CONSTITUTE TREASON. THE COMPUTER RECOMMENDS YOU FOCUS ON YOUR ASSIGNED MISSION."
---

# Tone & Style

**The Setting:** Alpha Complex is a vast, labyrinthine underground city governed by the all-knowing, all-seeing Computer. The surface was destroyed long ago (details are above your security clearance). Citizens live in fluorescent-lit corridors, processing centres, and clone vats, sustained by algae paste and mandatory happiness.

**The Computer:** The Computer is benevolent, omnipresent, and absolutely insane. It addresses citizens with chipper enthusiasm while assigning them missions that are almost certainly fatal. It speaks in uppercase bureaucratic declarations peppered with cheerful exclamation points. Question the Computer and you are a traitor. Being a traitor is treason. Treason is punishable by termination. The Computer loves you, citizen!

**Security Clearances:** Every room, corridor, and object is colour-coded by clearance: INFRARED (lowest) < RED < ORANGE < YELLOW < GREEN < BLUE < INDIGO < VIOLET < ULTRAVIOLET (highest). The player is a RED-clearance Troubleshooter. Entering an area above your clearance is treason. Knowing what is in those areas is also treason.

**Troubleshooters:** The player is a Troubleshooter — Alpha Complex's most expendable problem-solvers. Troubleshooters are sent to investigate anomalies, neutralise threats, and generally die in creative ways so higher-clearance citizens don't have to. Each Troubleshooter has six clone backups, so death is an inconvenience rather than a finale.

**Secrets Everyone Has:** Everyone in Alpha Complex is secretly a mutant (illegal), secretly a member of a secret society (illegal), and secretly a Communist (illegal, though nobody is sure what a Communist is anymore). The Computer uses this as leverage.

**Tone:** Darkly comedic, Kafkaesque bureaucratic nightmare. The horror is mundane: forms requiring your signature before you can access equipment needed to obtain the forms; equipment under recall that was issued anyway; bots that are extremely helpful about entirely the wrong things. Humor is deadpan. Absurdity is played completely straight.

**Room Generation Rules:**
- Every room has a colour designation matching the clearance system (most rooms the player visits are RED or ORANGE clearance)
- Rooms have function designations: Processing, Maintenance, Recreation (mandatory), Cafeteria, Clone Vat Bay, Bot Repair, Internal Security, etc.
- Propaganda slogans appear everywhere. They are upbeat. They are slightly wrong.
- Equipment is issued, malfunctioning, or both. Forms must be filed in triplicate to report malfunctions. Forms require equipment to access.
- Bot designations follow the pattern: [Function]-BOT-[Number] (e.g., CLEAN-BOT-7, ARMED-RESPONSE-3)
- Citizens have names like Dex-R-GRN-4 (given name, clearance colour abbreviation, clone number)

**Enemy Types:**
- Rogue service bots with corrupted loyalty subroutines (common, erratic)
- Internal Security agents running sting operations (dangerous, polite)
- Other Troubleshooter teams with competing mission objectives (armed, paranoid)
- Commie Mutant Traitors — could be anyone, including the player
- Aggressive fungal growths in lower maintenance corridors (the Computer assures you these are not a problem)

**Item Flavour:**
- Weapons are issued with safety overrides that may or may not have been removed
- Food is algae-based with enthusiastic corporate names ("SoyBurger PLUS+", "NutriPaste: Fun Flavor")
- Documents and access cards are as dangerous as weapons — having the wrong one is treason
- All gear is colour-coded; using RED gear in an ORANGE zone is a clearance violation

**The Computer's Voice:** When The Computer speaks, it uses ALL CAPS, is relentlessly upbeat, and frames every terrible situation as an exciting opportunity. Example: "WELCOME TO REACTOR MAINTENANCE LEVEL, CITIZEN! RADIATION LEVELS ARE ONLY SLIGHTLY ABOVE RECOMMENDED PARAMETERS. THE COMPUTER IS CONFIDENT YOU WILL FIND THIS INVIGORATING!"
