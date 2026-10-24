"""Local-only responsive and accessibility smoke test for compact algorithm toggles."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8873/')
parser.add_argument('--output', default='/workspace/compact-toggle-check')
args = parser.parse_args()
assert args.url.startswith(('http://127.0.0.1:', 'http://localhost:'))
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True, args=['--no-sandbox'])
    for width in (280, 320, 360, 390, 430, 768, 1440):
        page = browser.new_page(viewport={'width': width, 'height': 844}, is_mobile=width < 768, has_touch=width < 768)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url)
        page.locator('#layoutInputSettings').evaluate('(el) => el.open = true')
        page.locator('#moreCutSettings').evaluate('(el) => el.open = true')
        group = page.locator('.algorithm-options')
        group.scroll_into_view_if_needed()
        metrics = group.evaluate('''el => ({
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            rows: Array.from(el.querySelectorAll('label')).map(label => {
                const box = label.getBoundingClientRect();
                const text = label.querySelector('strong').getBoundingClientRect();
                const slider = label.querySelector('.switch-slider').getBoundingClientRect();
                return {x: box.x, y: box.y, width: box.width, height: box.height,
                    textFits: text.right <= slider.left && text.left >= box.left,
                    sliderFits: slider.right <= box.right,
                    fontSize: getComputedStyle(label.querySelector('strong')).fontSize};
            })
        })''')
        assert not metrics['overflow'], (width, metrics)
        assert all(row['height'] >= 44 and row['width'] >= 44 and row['textFits'] and row['sliderFits'] for row in metrics['rows']), (width, metrics)
        if width >= 320:
            assert abs(metrics['rows'][0]['y'] - metrics['rows'][1]['y']) < 1, (width, metrics)
            assert metrics['height'] <= 48, (width, metrics)
        for name, default in [('MaxRects', True), ('Guillotine', False)]:
            checkbox = page.get_by_role('checkbox', name=name, exact=True)
            assert checkbox.is_checked() == default
            page.locator('label', has=checkbox).click()
            assert checkbox.is_checked() != default
            checkbox.focus()
            checkbox.press('Space')
            assert checkbox.is_checked() == default
            assert checkbox.evaluate('(el) => el.matches(":focus-visible")')
            assert checkbox.evaluate('(el) => getComputedStyle(el.nextElementSibling).outlineStyle') != 'none'
        # Other settings retain their original full-sized appearance.
        assert page.locator('.display-unit-setting label').bounding_box()['height'] >= 72
        assert not errors, errors
        if width in (320, 390):
            group.scroll_into_view_if_needed()
            page.screenshot(path=str(out / f'compact-toggles-{width}.png'))
        results.append({'viewport': width, **metrics, 'interactionChecks': 'passed'})
        page.close()
    browser.close()
(out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(results, ensure_ascii=False, indent=2))
