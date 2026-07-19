export const SUBJECTS: [string, string][] = [
  ["Mathematics", "#2563eb"],
  ["Physics", "#4f46e5"],
  ["Chemistry", "#d97706"],
  ["Biology", "#059669"],
  ["Computer Science", "#0891b2"],
  ["History", "#a16207"],
  ["Literature", "#be123c"],
  ["Economics", "#0d9488"],
  ["Other", "#64748b"],
];

export const SUBJECT_COLORS = Object.fromEntries(SUBJECTS) as Record<
  string,
  string
>;

export const MOCK_NOTE = `Thermodynamics — Lecture 12

First law: ΔU = Q − W
• Internal energy change equals heat added minus work done by the system
• For an ideal gas, U depends only on temperature

Isothermal process (ΔT = 0):
  ΔU = 0 ⇒ Q = W
  Work: W = nRT ln(V₂/V₁)

Adiabatic process (Q = 0):
  ΔU = −W
  TV^{γ−1} = constant

Entropy reminder: dS ≥ đQ/T (equality for reversible).`;

export const FORMATTED_HTML = `<h1>Thermodynamics — Lecture 12</h1>
<section>
  <h2>First Law</h2>
  <p><strong>ΔU = Q − W</strong></p>
  <ul>
    <li>Internal energy change equals heat added minus work done by the system</li>
    <li>For an ideal gas, <em>U</em> depends only on temperature</li>
  </ul>
</section>
<section>
  <h2>Isothermal process</h2>
  <p>ΔU = 0 ⇒ Q = W</p>
  <p class="eq">W = nRT ln(V₂/V₁)</p>
</section>
<section>
  <h2>Adiabatic process</h2>
  <p>ΔU = −W</p>
  <p class="eq">TV<sup>γ−1</sup> = constant</p>
</section>
<section>
  <h2>Entropy</h2>
  <p>dS ≥ đQ/T</p>
</section>`;

export type NoteStatus = "processing" | "ready";

export type NoteItem = {
  id: string;
  title: string;
  subject: string;
  status: NoteStatus;
  html: string;
  orchestrator: string;
  corrected: boolean;
};

export type ResearchRow = {
  id: string;
  when: string;
  orchestrator: string;
  final: string;
  corrected: boolean;
};

export const INITIAL_NOTES: NoteItem[] = [
  {
    id: "math-1",
    title: "Derivatives cheat sheet",
    subject: "Mathematics",
    status: "ready",
    html: "",
    orchestrator: "Mathematics",
    corrected: false,
  },
  {
    id: "math-2",
    title: "Integrals workshop",
    subject: "Mathematics",
    status: "ready",
    html: "",
    orchestrator: "Mathematics",
    corrected: false,
  },
  {
    id: "phys-1",
    title: "Thermodynamics — Lecture 12",
    subject: "Physics",
    status: "ready",
    html: FORMATTED_HTML,
    orchestrator: "Physics",
    corrected: false,
  },
  {
    id: "phys-2",
    title: "Newton’s laws review",
    subject: "Physics",
    status: "ready",
    html: "",
    orchestrator: "Physics",
    corrected: false,
  },
  {
    id: "chem-1",
    title: "Stoichiometry drills",
    subject: "Chemistry",
    status: "ready",
    html: "",
    orchestrator: "Chemistry",
    corrected: false,
  },
  {
    id: "bio-1",
    title: "Cell organelles map",
    subject: "Biology",
    status: "ready",
    html: "",
    orchestrator: "Biology",
    corrected: false,
  },
  {
    id: "bio-2",
    title: "Mendelian genetics",
    subject: "Biology",
    status: "ready",
    html: "",
    orchestrator: "Biology",
    corrected: false,
  },
  {
    id: "cs-1",
    title: "Big-O notation",
    subject: "Computer Science",
    status: "ready",
    html: "",
    orchestrator: "Computer Science",
    corrected: false,
  },
  {
    id: "hist-1",
    title: "Industrial Revolution",
    subject: "History",
    status: "ready",
    html: "",
    orchestrator: "History",
    corrected: false,
  },
  {
    id: "lit-1",
    title: "Sonnet structure",
    subject: "Literature",
    status: "ready",
    html: "",
    orchestrator: "Literature",
    corrected: false,
  },
  {
    id: "econ-1",
    title: "Supply & demand",
    subject: "Economics",
    status: "ready",
    html: "",
    orchestrator: "Economics",
    corrected: false,
  },
  {
    id: "other-1",
    title: "Study skills",
    subject: "Other",
    status: "ready",
    html: "",
    orchestrator: "Other",
    corrected: false,
  },
];

export const INITIAL_RESEARCH: ResearchRow[] = [
  {
    id: "phys-1",
    when: "3d",
    orchestrator: "Physics",
    final: "Physics",
    corrected: false,
  },
  {
    id: "bio-1",
    when: "2d",
    orchestrator: "Biology",
    final: "Biology",
    corrected: false,
  },
  {
    id: "hist-1",
    when: "1d",
    orchestrator: "History",
    final: "History",
    corrected: false,
  },
];
