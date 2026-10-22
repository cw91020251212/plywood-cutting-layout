"""Responsive smoke test. Requires Python Playwright and Chrome.
Run a loopback HTTP server first, then: python3 scripts/check-mobile-view.py
Supports loopback previews and the authorized GitHub Pages deployment.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8873/')
parser.add_argument('--output', default='/workspace/plywood-mobile-results')
args = parser.parse_args()
assert args.url.startswith(('http://127.0.0.1:', 'http://localhost:', 'https://cw91020251212.github.io/plywood-cutting-layout/')), 'Only app previews and authorized deployment allowed'
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True, args=['--no-sandbox'])
    for width, height in [(320, 740), (360, 800), (390, 844), (430, 932), (600, 900), (767, 900), (844, 390), (1440, 900)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=width<1100, has_touch=width<1100)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url)
        nav = page.locator('#mobile-step-nav')
        assert nav.count() == 0, 'Removed four-step bar must not return'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'Page overflow at {width}'
        if width <= 767:
            page.get_by_role('textbox', name='部件長度（毫米）', exact=True).fill('440')
            page.get_by_role('textbox', name='部件闊度（毫米）', exact=True).fill('300')
            page.get_by_role('textbox', name='部件數量', exact=True).fill('2')
            page.locator('#section-parts').get_by_role('button', name='新增', exact=True).click()
            assert page.locator('#partsTableBody tr').count() == 1
            page.locator('#section-boards').scroll_into_view_if_needed()
            page.get_by_role('textbox', name='原板長度（毫米）', exact=True).fill('2440')
            page.get_by_role('textbox', name='原板闊度（毫米）', exact=True).fill('1220')
            page.locator('#section-boards').get_by_role('button', name='新增', exact=True).click()
            assert page.locator('#boardsTableBody tr').count() == 1
            page.locator('#calculateButton').scroll_into_view_if_needed()
            page.locator('#calculateButton').click()
            page.wait_for_function('window.calculator && calculator.trialPlan && calculator.trialPlan.validation.ok', timeout=30000)
            assert page.locator('#canvasContainer canvas').count() >= 1
            plan = page.evaluate('({ok:calculator.trialPlan.validation.ok,placed:calculator.trialPlan.summary.placedParts})')
            assert plan['ok'] and plan['placed'] == 2
            page.wait_for_function("document.querySelector('#wood-status-text').textContent.startsWith('方案 ')")
            assert '最大完整餘板' in page.locator('#wood-status-text').inner_text()
            page.locator('#wood-info-bar').click()
            assert '方案比較' in page.locator('#wood-info-full').inner_text()
            assert '狹長條、碎料不當作省料' in page.locator('#wood-info-full').inner_text()
            assert page.evaluate('Number(getComputedStyle(document.querySelector("#wood-info-overlay")).zIndex) > Number(getComputedStyle(document.querySelector("#layoutRemote")).zIndex)'), 'Remote must not cover comparison text'
            modal = page.locator('#wood-info-modal')
            bounds = modal.bounding_box()
            assert bounds and bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= height
            assert modal.evaluate('(e)=>e.scrollHeight > e.clientHeight'), 'Long comparison must scroll inside modal'
            page.locator('#wood-info-overlay').click(position={'x': 2, 'y': 2})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'Result overflow at {width}'
            page.locator('#section-parts').evaluate('(e)=>e.scrollIntoView()')
            if width in (320,390):
                page.get_by_role('textbox', name='部件長度（毫米）', exact=True).wait_for(state='visible')
                page.wait_for_timeout(300)
                page.screenshot(path=str(out/f'mobile-{width}-inputs.png'))
                page.locator('#canvasContainer').evaluate('(e)=>e.scrollIntoView()')
                page.wait_for_timeout(300)
                page.screenshot(path=str(out/f'mobile-{width}-results.png'))
            if width == 390:
                chooser = page.locator('#candidateChooser')
                assert chooser.locator('option').count() > 1, 'Fixture must offer actual alternatives'
                page.locator('#remoteNextVariation').click()
                page.wait_for_function("document.querySelector('#wood-status-text').textContent.startsWith('方案 2/')")
                page.locator('#wood-info-bar').click()
                assert '目前：方案 2' in page.locator('#wood-info-full').inner_text()
                page.evaluate('window.PlywoodTrialUI.commitCandidate(0)')
                page.wait_for_function("document.querySelector('#wood-info-full').textContent.includes('目前：方案 1')")
                page.screenshot(path=str(out/'mobile-390-scheme-comparison.png'))
                page.locator('#wood-info-overlay').click(position={'x': 2, 'y': 2})
                page.evaluate('window.__schemeBeforeSearch = window.calculator.trialPlan')
                page.evaluate('async()=>await window.PlywoodTrialUI.searchMoreCandidates()')
                assert page.evaluate('window.calculator.trialPlan === window.__schemeBeforeSearch'), 'Search must preserve selection'
                assert page.evaluate('document.querySelector("#wood-status-text").textContent.startsWith("方案 " + (window.calculator._trialCandidateIndex+1) + "/" + window.calculator._trialCandidates.length)')
            page.locator('#languageSwitchButton').click()
            page.wait_for_function("document.querySelector('#wood-status-text').textContent.startsWith('Scheme ')")
            assert page.locator('#partsTable-mobile-hint').count() == 0, 'Original input tables must stay untouched'
            assert page.locator('#boardsTable-mobile-hint').count() == 0
            page.evaluate("document.body.classList.add('wood-dark-mode')")
            assert nav.count() == 0
            page.evaluate("document.body.classList.add('portrait-display-active')")
            assert nav.count() == 0
            page.evaluate("document.body.classList.remove('portrait-display-active')")
            assert nav.count() == 0
            page.emulate_media(media='print')
            assert nav.count() == 0
        assert not errors, errors
        results.append({'width': width, 'height': height, 'ok': True, 'page_errors': errors})
        print(f'PASS {width}x{height}', flush=True)
        context.close()
    browser.close()
(out/'mobile-smoke-results.json').write_text(json.dumps(results, indent=2)+'\n')
