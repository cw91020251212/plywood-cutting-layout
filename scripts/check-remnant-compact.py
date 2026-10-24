"""Local-only responsive remnant checkbox regression checks."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/remnant-compact-check')
OUT.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:8873/'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True, args=['--no-sandbox'])
    for width in (280, 320, 360, 390, 430, 768, 1440):
        page = browser.new_page(viewport={'width': width, 'height': 844}, is_mobile=width < 768, has_touch=width < 768)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL)
        page.locator('#layoutDisplaySettings').evaluate('(el) => el.open = true')
        assert page.locator('#partAppearanceHint').count() == 0
        assert page.locator('#partAppearanceStyle').get_attribute('aria-describedby') is None
        assert '保留各尺寸的識別色' not in page.locator('.part-appearance-toolbar').inner_text()
        group = page.locator('.remnant-display-options')
        group.scroll_into_view_if_needed()
        metrics = group.evaluate('''el => ({
            height: el.getBoundingClientRect().height,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            labels: [...el.querySelectorAll('label')].map(label => {
                const r = label.getBoundingClientRect(), cb = label.querySelector('input').getBoundingClientRect();
                return {x:r.x, y:r.y, width:r.width, height:r.height, checkboxWidth:cb.width, checkboxHeight:cb.height,
                    fits:[...label.querySelectorAll('span')].every(s => {const b=s.getBoundingClientRect();return b.left>=cb.right && b.right<=r.right+1 && s.scrollWidth<=s.clientWidth+1;})};
            })
        })''')
        assert not metrics['overflow'], (width, metrics)
        assert len(metrics['labels']) == 2
        assert abs(metrics['labels'][0]['y'] - metrics['labels'][1]['y']) < 1
        assert group.locator('span').count() == 2
        assert '長、闊各一次' not in group.inner_text() and 'R 編號' not in group.inner_text()
        assert all(r['height'] >= 44 and r['fits'] and r['checkboxWidth'] == 20 and r['checkboxHeight'] == 20 for r in metrics['labels']), (width, metrics)
        if width >= 320:
            assert metrics['height'] <= 64, (width, metrics)
        for element_id, key, other_id in (
            ('showRemnantDimensions', 'plywood-layout-remnant-dimensions-v1', 'showRemnantLabels'),
            ('showRemnantLabels', 'plywood-layout-remnant-labels-v1', 'showRemnantDimensions'),
        ):
            checkbox = page.locator('#' + element_id)
            assert checkbox.is_checked()
            page.locator('label[for="' + element_id + '"]').click()
            assert not checkbox.is_checked()
            assert page.locator('#' + other_id).is_checked()
            assert page.evaluate('(key) => localStorage.getItem(key)', key) == 'false'
            page.reload()
            page.locator('#layoutDisplaySettings').evaluate('(el) => el.open = true')
            assert not checkbox.is_checked()
            checkbox.focus()
            checkbox.press('Space')
            assert checkbox.is_checked()
            assert checkbox.evaluate('(el) => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none"')
            assert page.evaluate('(key) => localStorage.getItem(key)', key) == 'true'
        if width in (320, 390):
            page.locator('#layoutDisplaySettings').evaluate('(el) => el.scrollIntoView({block:"start"})')
            page.screenshot(path=str(OUT / f'remnant-compact-{width}.png'))
        page.locator('#languageSwitchButton').click()
        assert 'Remnant IDs' in group.inner_text()
        assert 'Leftover dimensions' in group.inner_text()
        assert 'R labels' not in group.inner_text() and 'Length and width once' not in group.inner_text()
        assert group.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        assert not errors, errors
        results.append({'viewport': width, **metrics, 'interactionsAndPersistence': 'passed', 'bilingual': 'passed'})
        print(f'PASS {width}px: group {metrics["height"]}px', flush=True)
        page.close()
    browser.close()
(OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
