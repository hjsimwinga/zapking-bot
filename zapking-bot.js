import { SimplePool, nip19, getEventHash, getSignature, getPublicKey } from 'nostr-tools';
import 'websocket-polyfill';

// Configuration for the ZapKing bot
const nsecKey = 'nsec1egsl0ju80h2crkalshu90c5hk99e3wt7m5zhtrsj7rkfe37l0ghq0y2d8d'; // Your private key
const privateKey = nip19.decode(nsecKey).data;
const publicKey = getPublicKey(privateKey);

console.log(`Bot public key: ${nip19.npubEncode(publicKey)}`);

// Target user to monitor (BuzzBot)
const BUZZBOTPUBKEY = 'npub1e85mms9s8ssm6vm6ztw0tdrr6j0a4l5gf2sjhw2scxpwnexmaxuqcev9em';
const BUZZBOTHEX = nip19.decode(BUZZBOTPUBKEY).data;

console.log(`Monitoring for mentions of BuzzBot: ${BUZZBOTHEX} (hex) / ${BUZZBOTPUBKEY} (npub)`);

// Relays to connect to
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

// Create a pool for relay connections
const pool = new SimplePool();

// Track processed events to avoid duplicates
const processedEvents = new Set();

// Function to sign and send a Nostr event
async function signAndSend(eventData) {
  eventData.id = getEventHash(eventData);
  eventData.sig = getSignature(eventData, privateKey);

  const pubs = pool.publish(RELAYS, eventData);

  await Promise.any(pubs).catch(e => {
    console.log('Failed to publish to any relay:', e);
  });

  return eventData;
}

// Function to react to a post with "⚡⚡⚡"
async function reactToPost(event) {
  try {
    console.log(`Reacting to post: ${event.id.slice(0, 10)}...`);

    // Create a reaction (like)
    const likeEvent = {
      kind: 7, // Reaction
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', event.id],
        ['p', event.pubkey]
      ],
      content: '+', // Like
      pubkey: publicKey
    };

    await signAndSend(likeEvent);
    console.log('Liked the post');

    // Create a comment with ⚡⚡⚡
    const commentEvent = {
      kind: 1, // Note
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', event.id, '', 'reply'],
        ['p', event.pubkey]
      ],
      content: '⚡⚡⚡',
      pubkey: publicKey
    };

    await signAndSend(commentEvent);
    console.log('Commented on the post');

    // Create a repost
    const repostEvent = {
      kind: 6, // Repost
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', event.id],
        ['p', event.pubkey]
      ],
      content: '',
      pubkey: publicKey
    };

    await signAndSend(repostEvent);
    console.log('Reposted the post');

    console.log('Success! Liked, commented, and reposted');
  } catch (error) {
    console.log('Error:', error.message);
  }
}

// Function to set up profile for ZapKing
async function setupProfile() {
  const profileEvent = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      name: "ZapKing",
      about: "I react to posts mentioning BuzzBot ⚡",
      picture: "https://cdn-icons-png.flaticon.com/512/1532/1532529.png"
    }),
    pubkey: publicKey
  };

  await signAndSend(profileEvent);
  console.log('Profile updated for ZapKing');
}

// Updated detection function: only react to original posts with exact BuzzBot mention (npub or @buzzbot), no replies/comments
function detectsBuzzBotMention(event) {
  if (event.kind !== 1) return false;

  // Ignore replies/comments (posts with any 'e' tag)
  const isReplyOrComment = event.tags.some(tag => tag[0] === 'e');
  if (isReplyOrComment) return false;

  const contentLower = event.content.toLowerCase();

  // Check if content contains the exact BuzzBot npub OR '@buzzbot'
  const mentionsNpub = event.content.includes(BUZZBOTPUBKEY);
  const mentionsName = contentLower.includes('@buzzbot');

  return mentionsNpub || mentionsName;
}

// Function to monitor new posts
async function monitorPosts() {
  console.log('ZapKing bot is starting...');

  await setupProfile();

  // Subscribe to all new notes (kind 1)
  const sub = pool.sub(RELAYS, [
    {
      kinds: [1],
      since: Math.floor(Date.now() / 1000)
    }
  ]);

  sub.on('event', (event) => {
    if (processedEvents.has(event.id)) return;
    if (event.pubkey === publicKey) return;

    processedEvents.add(event.id);

    if (detectsBuzzBotMention(event)) {
      reactToPost(event);
    }
  });

  setInterval(() => {
    if (processedEvents.size > 1000) {
      const oldestEvents = Array.from(processedEvents).slice(0, 500);
      oldestEvents.forEach(id => processedEvents.delete(id));
      console.log(`Cleared ${oldestEvents.length} old events from memory. Current size: ${processedEvents.size}`);
    }
  }, 3600000);

  console.log('Listening for events...');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down ZapKing bot...');
  pool.close(RELAYS);
  process.exit(0);
});

monitorPosts();
