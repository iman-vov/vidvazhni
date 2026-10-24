import { describe, expect, it } from 'vitest';
import { newCampaign } from '../../src/rules/campaign';
import { loadContent } from '../../src/rules/load';
import { CAMPAIGN_KEY, GAME_KEY, campaignStorage, memoryStore } from '../../src/app/storage';

const c = loadContent();
const players = [{ id: 'p1', name: 'Оля' }];
const state = () => newCampaign(c, { players: ['p1'], heroes: [{ classId: 'warden', playerId: 'p1' }] });

describe('campaignStorage', () => {
  it('saves and loads the campaign under its own key', () => {
    const kv = memoryStore();
    const store = campaignStorage(kv);
    expect(store.load()).toBeNull();
    store.save(state(), players);
    expect(kv.get(GAME_KEY)).toBeNull();
    expect(kv.get(CAMPAIGN_KEY)).not.toBeNull();
    const got = store.load();
    expect(got?.campaign.heroes[0]?.classId).toBe('warden');
    expect(got?.players).toEqual(players);
    store.clear();
    expect(store.load()).toBeNull();
  });

  it('ignores another version and broken JSON', () => {
    const kv = memoryStore();
    const store = campaignStorage(kv);
    store.save(state(), players);
    const saved = JSON.parse(kv.get(CAMPAIGN_KEY) as string);
    kv.set(CAMPAIGN_KEY, JSON.stringify({ ...saved, version: 99 }));
    expect(store.load()).toBeNull();
    kv.set(CAMPAIGN_KEY, JSON.stringify({ ...saved, campaign: { ...saved.campaign, version: 99 } }));
    expect(store.load()).toBeNull();
    kv.set(CAMPAIGN_KEY, '{oops');
    expect(store.load()).toBeNull();
  });
});
