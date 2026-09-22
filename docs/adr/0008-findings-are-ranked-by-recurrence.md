# Findings are ranked by recurrence across samples, not by stated confidence

Each checker runs several independent samples, and a finding is reported by how many samples found it. It is scored from that recurrence, the checkers that agree, the outline section it invalidates and whether it quotes evidence. The evaluation literature finds a stated confidence or severity per finding to be noise. A second verify reading then drops findings a reader of the story would not see.

## Considered Options

- **A stated confidence or severity per finding**: noise.
- **`keep_if` as the auto-accept bar**: it decides what is shown, not what is acted on.
