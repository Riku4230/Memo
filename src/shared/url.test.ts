import { describe, expect, it } from 'vitest';
import { extractUrl, isHttpUrl, urlDomain } from './url';

describe('URL', () => {
  it('http / https だけを受け付ける', () => {
    expect(isHttpUrl('https://example.com/a?b=1')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,hi')).toBe(false);
    expect(isHttpUrl('example.com')).toBe(false);
    expect(isHttpUrl(`https://example.com/${'a'.repeat(2100)}`)).toBe(false);
  });

  it('共有で付いた前後の文章から URL を取り出す', () => {
    expect(extractUrl('これ良さそう！ https://www.amazon.co.jp/dp/B0XXXX 送料無料')).toBe('https://www.amazon.co.jp/dp/B0XXXX');
    expect(extractUrl('「洗濯機」https://example.com/item。')).toBe('https://example.com/item');
    expect(extractUrl('  https://example.com/a.  ')).toBe('https://example.com/a');
    expect(extractUrl('ただの文字')).toBe('ただの文字');
  });

  it('表示名がないときはドメインを出す', () => {
    expect(urlDomain('https://www.yodobashi.com/product/1')).toBe('yodobashi.com');
  });
});
