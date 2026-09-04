# research — what the published record supports

**Everything in this folder comes from research sources only.** These are
literature reviews, not project documents: each one surveys published work on a
problem the anthology has, states what the evidence supports, and marks what it
does not. Nothing here describes this repository, depends on anything outside
this folder, or is fitted to a particular corpus. Figures carry the work they
came from, and figures that could not be verified against the source say so.

| file | what it is |
| :-- | :-- |
| `generation.md` | why a generation call is shaped the way it is — that diversity collapse is fixed at training rather than at sampling, that the specific failure in fiction is premature resolution, what raises batch diversity and by how much, why negation and long sessions are the wrong instruments, and why no scoring model makes the final cut |
| `literature.md` | on what grounds horror and SF are judged, and which of those grounds survive translation into an instruction to a blind judge — the convergent criticism, then the evidence that an LLM judge cannot reliably measure the criterion those traditions care most about |
| `tagging.md` | how to label prose so the labels mean something — register dimensions, style embeddings, focalization, appraisal, and what is known about letting a model do the labelling: moderate agreement, label collapse, and reliability that is not validity |
| `themes.md` | what a theme is under four incompatible definitions, why extractive methods cannot produce one, what motif indexing and taxonomy induction actually achieve, and why topic-coherence metrics rank backwards against human judgement |

Read `literature.md` and `generation.md` together: they reach the same
conclusion about model-scored judgement from opposite directions, independently.
