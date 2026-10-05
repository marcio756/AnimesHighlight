import test from 'node:test';
import assert from 'node:assert/strict';
import { TextNormalizer, Matcher, SeasonExtractor, ProgressExtractor, isUiNoise, CONFIG } from '../src/content/utils.js';
import { ReleaseMonitorService } from '../src/background/services/monitor.service.js';

test('isUiNoise: real titles are never treated as UI noise', () => {
    for (const title of ['Sword Art Online', 'Love Live!', 'Alive', 'My Home Hero']) assert.equal(isUiNoise(title), false, title);
});

test('isUiNoise: pure UI labels are noise', () => {
    for (const label of ['Online', 'Home', 'Episódio 12', 'Lista de animes', 'Login']) assert.equal(isUiNoise(label), true, label);
});

test('TextNormalizer: strips accents, quality tags and season markers', () => {
    assert.equal(TextNormalizer.normalize('Shingeki no Kyojin Legendado HD'), 'shingeki no kyojin');
    assert.equal(TextNormalizer.normalize('Overlord III'), 'overlord 3');
    assert.equal(TextNormalizer.normalize('ab'), '');
});

test('Matcher: same franchise but different season must not match', () => {
    assert.equal(Matcher.isFuzzyMatch('one piece', 'one piece'), true);
    assert.equal(Matcher.isFuzzyMatch('overlord 3', 'overlord'), false);
});

test('SeasonExtractor / ProgressExtractor', () => {
    assert.equal(SeasonExtractor.extractSeasonNumber('Naruto 3rd Season'), 3);
    assert.equal(ProgressExtractor.extract('/anime/naruto/episodio-12', 'anime'), 12);
    assert.equal(ProgressExtractor.extract('/manga/naruto/capitulo-7', 'manga'), 7);
});

test('blocked domains list contains only hostnames/prefixes', () => {
    assert.ok(CONFIG.BLOCKED_DOMAINS.includes('youtube.com'));
});

test('detectRelease: finds the next episode link and rejects non-http links', () => {
    const html = '<a href="/anime/frieren-episodio-5">Frieren Episodio 5</a><a href="javascript:frieren(5)">Frieren Episodio 5</a>';
    const url = ReleaseMonitorService.detectRelease(html, 'Frieren', 5, 'https://site.example/latest');
    assert.equal(url, 'https://site.example/anime/frieren-episodio-5');
    assert.equal(ReleaseMonitorService.detectRelease(html, 'Frieren', 9, 'https://site.example/latest'), null);
});
