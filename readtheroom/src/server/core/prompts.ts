/** A hand-written prompt before it gets assigned to a day. */
export type PromptSeed = {
  question: string;
  left: string;
  right: string;
};

/**
 * Bundled fallback prompts, used whenever the approved community queue is
 * empty. The daily scheduler walks this list with a persistent cursor, so it
 * loops after 30 days.
 */
export const BUNDLED_PROMPTS: readonly PromptSeed[] = [
  // Food
  {
    question: 'Pineapple on pizza',
    left: 'A crime against Italy',
    right: 'A tropical masterpiece',
  },
  {
    question: 'Is a hot dog a sandwich?',
    left: 'Absolutely not',
    right: 'Obviously yes',
  },
  {
    question: 'Pouring the milk in before the cereal',
    left: 'Psychopath behavior',
    right: 'Perfectly valid',
  },
  {
    question: 'Cold pizza for breakfast',
    left: 'A cry for help',
    right: 'Elite dining',
  },
  {
    question: 'Cilantro',
    left: 'Tastes like soap',
    right: 'Tastes like heaven',
  },
  {
    question: 'Ketchup on scrambled eggs',
    left: 'An abomination',
    right: 'Essential',
  },
  {
    question: 'Ordering a steak well-done',
    left: 'Your money, your choice',
    right: 'Ruining a perfectly good cow',
  },
  {
    question: 'Mint chocolate chip ice cream',
    left: 'Frozen toothpaste',
    right: 'Flavor perfection',
  },
  {
    question: 'Eating the crust of the pizza',
    left: 'Free bread, obviously eat it',
    right: 'That is just the handle',
  },
  {
    question:
      'A hot dog costs $1.50 at the hardware store. How suspicious is that?',
    left: 'Just a nice deal',
    right: 'Do NOT ask what is in it',
  },
  // Tech
  {
    question: 'How do you pronounce "GIF"?',
    left: 'Hard G, like "gift"',
    right: 'Like the peanut butter',
  },
  {
    question: 'Tabs vs. spaces',
    left: 'Tabs, end of discussion',
    right: 'Spaces, like a civilized person',
  },
  {
    question: 'Will AI take your job?',
    left: 'My job is safe forever',
    right: 'It already has my badge',
  },
  {
    question: 'Autoplaying video with sound on a website',
    left: 'Mildly annoying',
    right: 'Should be a war crime',
  },
  {
    question: 'Reaching inbox zero',
    left: 'A pointless obsession',
    right: 'The only path to inner peace',
  },
  {
    question: 'Using light mode',
    left: 'A lifestyle choice',
    right: 'Actual villain behavior',
  },
  {
    question: 'Phone at 4% and no charger in sight',
    left: 'Meh, it dies when it dies',
    right: 'Full-blown crisis mode',
  },
  // Movies & culture
  {
    question: 'Die Hard is a Christmas movie',
    left: 'Absolutely not',
    right: 'THE definitive Christmas movie',
  },
  {
    question: '"The book was better than the movie"',
    left: 'Rarely true',
    right: 'Always true',
  },
  {
    question: 'Talking during a movie at home',
    left: 'It is my living room',
    right: 'Grounds for ending the friendship',
  },
  {
    question: 'Watching with subtitles on, always',
    left: 'Why are you reading your TV',
    right: 'The only correct way to watch',
  },
  {
    question: 'Pluto',
    left: 'Sorry, just a big rock',
    right: 'Forever a planet in our hearts',
  },
  // Life
  {
    question: 'Wearing socks with sandals',
    left: 'Fashion felony',
    right: 'Comfort visionary',
  },
  {
    question: 'Replying to a text with "k."',
    left: 'Totally harmless',
    right: 'A declaration of war',
  },
  {
    question: 'Reclining your seat on a plane',
    left: 'Your seat, your right',
    right: 'An act of pure villainy',
  },
  {
    question: 'Toilet paper: over or under?',
    left: 'Under, fight me',
    right: 'Over, as the patent intended',
  },
  {
    question: 'Speakerphone calls in public',
    left: 'Live and let live',
    right: 'Straight to jail',
  },
  {
    question: 'The middle seat armrests belong to...',
    left: 'Window and aisle, obviously',
    right: 'The middle-seat martyr',
  },
  {
    question: 'Starting an email with "Per my last email"',
    left: 'Professional and clear',
    right: 'Workplace violence',
  },
  {
    question: 'Camping as a vacation',
    left: 'Paying to sleep in dirt',
    right: 'The best trip there is',
  },
];
