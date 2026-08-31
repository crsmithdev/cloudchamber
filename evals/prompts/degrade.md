# Degradation prompt

Rebuild `corpus/degraded.json` when the slate changes.

Take six synopses from `stories/`. For each, produce six variants, each removing
exactly ONE §0 property and changing nothing else. The whole validity of the test
rests on this: if the prose is rewritten, the test measures prose. Hold length
within 10%, and hold voice, sentence rhythm, specificity of detail and proper
nouns constant except where the proper noun is the thing being removed.

D1_no_impossibility · D2_no_turn · D3_generic · D4_reckoning · D5_exit · D6_small
(defined in ../README.md)

Then self-check three variants at random: name the single substantive difference
from the base and confirm no stylistic one. Check punctuation counts and sentence
counts against the base — a typographic signature is enough for a judge to key on,
and one was caught this way on the first build.
