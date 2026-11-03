```bnitz
{
  "title": "The Bitter Lesson",
  "author": "Rich Sutton",
  "year": 2019
}
```

<!-- passage: passage-1 -->

==The biggest lesson that can be read from 70 years of AI research is that general methods that leverage computation are ultimately the most effective, and by a large margin.== The ultimate reason for this is Moore's law, or rather its generalization of continued exponentially falling cost per unit of computation. Most AI research has been conducted as if the computation available to the agent were constant (in which case leveraging human knowledge would be one of the only ways to improve performance) but, over a slightly longer time than a typical research project, massively more computation inevitably becomes available. Seeking an improvement that makes a difference in the shorter term, researchers seek to leverage their human knowledge of the domain, but the only thing that matters in the long run is the leveraging of computation. These two need not run counter to each other, but in practice they tend to. Time spent on one is time not spent on the other. There are psychological commitments to investment in one approach or the other. And the human-knowledge approach tends to complicate methods in ways that make them less suited to taking advantage of general methods leveraging computation. There were many examples of AI researchers' belated learning of this bitter lesson, and it is instructive to review some of the most prominent.

<!-- passage: passage-2 -->

==In computer chess, the methods that defeated the world champion, Kasparov, in 1997, were based on massive, deep search.== At the time, this was looked upon with dismay by the majority of computer-chess researchers who had pursued methods that leveraged human understanding of the special structure of chess. When a simpler, search-based approach with special hardware and software proved vastly more effective, these human-knowledge-based chess researchers were not good losers. They said that ``brute force" search may have won this time, but it was not a general strategy, and anyway it was not how people played chess. These researchers wanted methods based on human input to win and were disappointed when they did not.

<!-- passage: passage-3 -->

==A similar pattern of research progress was seen in computer Go, only delayed by a further 20 years.== Enormous initial efforts went into avoiding search by taking advantage of human knowledge, or of the special features of the game, but all those efforts proved irrelevant, or worse, once search was applied effectively at scale. Also important was the use of learning by self play to learn a value function (as it was in many other games and even in chess, although learning did not play a big role in the 1997 program that first beat a world champion). Learning by self play, and learning in general, is like search in that it enables massive computation to be brought to bear. Search and learning are the two most important classes of techniques for utilizing massive amounts of computation in AI research. In computer Go, as in computer chess, researchers' initial effort was directed towards utilizing human understanding (so that less search was needed) and only much later was much greater success had by embracing search and learning.

<!-- passage: passage-4 -->

==In speech recognition, there was an early competition, sponsored by DARPA, in the 1970s.== Entrants included a host of special methods that took advantage of human knowledge---knowledge of words, of phonemes, of the human vocal tract, etc. On the other side were newer methods that were more statistical in nature and did much more computation, based on hidden Markov models (HMMs). Again, the statistical methods won out over the human-knowledge-based methods. This led to a major change in all of natural language processing, gradually over decades, where statistics and computation came to dominate the field. The recent rise of deep learning in speech recognition is the most recent step in this consistent direction. Deep learning methods rely even less on human knowledge, and use even more computation, together with learning on huge training sets, to produce dramatically better speech recognition systems. As in the games, researchers always tried to make systems that worked the way the researchers thought their own minds worked---they tried to put that knowledge in their systems---but it proved ultimately counterproductive, and a colossal waste of researcher's time, when, through Moore's law, massive computation became available and a means was found to put it to good use.

<!-- passage: passage-5 -->

==In computer vision, there has been a similar pattern.== Early methods conceived of vision as searching for edges, or generalized cylinders, or in terms of SIFT features. But today all this is discarded. Modern deep-learning neural networks use only the notions of convolution and certain kinds of invariances, and perform much better.

<!-- passage: passage-6 -->

==This is a big lesson.== As a field, we still have not thoroughly learned it, as we are continuing to make the same kind of mistakes. To see this, and to effectively resist it, we have to understand the appeal of these mistakes. We have to learn the bitter lesson that building in how we think we think does not work in the long run. The bitter lesson is based on the historical observations that 1) AI researchers have often tried to build knowledge into their agents, 2) this always helps in the short term, and is personally satisfying to the researcher, but 3) in the long run it plateaus and even inhibits further progress, and 4) breakthrough progress eventually arrives by an opposing approach based on scaling computation by search and learning. The eventual success is tinged with bitterness, and often incompletely digested, because it is success over a favored, human-centric approach.

<!-- passage: passage-7 -->

==One thing that should be learned from the bitter lesson is the great power of general purpose methods, of methods that continue to scale with increased computation even as the available computation becomes very great.== The two methods that seem to scale arbitrarily in this way are search and learning.

<!-- passage: passage-8 -->

==The second general point to be learned from the bitter lesson is that the actual contents of minds are tremendously, irredeemably complex; we should stop trying to find simple ways to think about the contents of minds, such as simple ways to think about space, objects, multiple agents, or symmetries.== All these are part of the arbitrary, intrinsically-complex, outside world. They are not what should be built in, as their complexity is endless; instead we should build in only the meta-methods that can find and capture this arbitrary complexity. Essential to these methods is that they can find good approximations, but the search for them should be by our methods, not by us. We want AI agents that can discover like we can, not which contain what we have discovered. Building in our discoveries only makes it harder to see how the discovering process can be done.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 680" fill="none">
  <g id="map-top" aria-label="Top triangle" data-passages="passage-1">
    <polygon points="230,33 143,139 317,139" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
  </g>
  <g id="map-ring" aria-label="Circular ring" data-passages="passage-2" data-outline="true">
    <circle cx="230" cy="340" r="145" stroke="currentColor" stroke-width="1.8" />
  </g>
  <g id="map-northwest" aria-label="Upper left node" data-passages="passage-3">
    <circle cx="127.5" cy="237.5" r="12.5" stroke="currentColor" stroke-width="1.8" />
  </g>
  <g id="map-northeast" aria-label="Upper right node" data-passages="passage-4">
    <circle cx="332.5" cy="237.5" r="12.5" stroke="currentColor" stroke-width="1.8" />
  </g>
  <g id="map-southwest" aria-label="Lower left node" data-passages="passage-5">
    <circle cx="127.5" cy="442.5" r="12.5" stroke="currentColor" stroke-width="1.8" />
  </g>
  <g id="map-southeast" aria-label="Lower right node" data-passages="passage-6">
    <circle cx="332.5" cy="442.5" r="12.5" stroke="currentColor" stroke-width="1.8" />
  </g>
  <g id="map-center" aria-label="Center circle" data-passages="passage-7">
    <circle cx="230" cy="340" r="25" stroke="currentColor" stroke-width="1.8" />
  </g>
  <g id="map-bottom-left" aria-label="Bottom triangle left half" data-passages="passage-8">
    <polygon points="143,541 230,541 230,647" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
  </g>
  <g id="map-bottom-right" aria-label="Bottom triangle right half" data-passages="passage-8">
    <polygon points="230,541 317,541 230,647" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
  </g>
  <g id="map-northwest-star-1" transform="translate(114 206)" aria-label="Upper left star one" data-passages="passage-3">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-northwest-star-2" transform="translate(91 243)" aria-label="Upper left star two" data-passages="passage-3">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-northeast-star-1" transform="translate(346 206)" aria-label="Upper right star one" data-passages="passage-4">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-northeast-star-2" transform="translate(369 243)" aria-label="Upper right star two" data-passages="passage-4">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-southwest-star-1" transform="translate(91 437)" aria-label="Lower left star one" data-passages="passage-5">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-southwest-star-2" transform="translate(114 474)" aria-label="Lower left star two" data-passages="passage-5">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-southeast-star-1" transform="translate(369 437)" aria-label="Lower right star one" data-passages="passage-6">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
  <g id="map-southeast-star-2" transform="translate(346 474)" aria-label="Lower right star two" data-passages="passage-6">
    <path d="M0-6 1.2-2.1 5.2-3 2.4 0 5.2 3 1.2 2.1 0 6-1.2 2.1-5.2 3-2.4 0-5.2-3-1.2-2.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </g>
</svg>
```
