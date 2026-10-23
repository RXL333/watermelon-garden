"""Package exactly the resources from the current build, without deleting older local builds."""
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
output = root / 'dist'
service_worker = (output / 'sw.js').read_text(encoding='utf-8')
files = json.loads(re.search(r'const FILES = (\[[^\n]+\])\.map', service_worker).group(1))
files = sorted(set(files + ['sw.js', '.nojekyll']))
destination = root / 'artifacts' / 'watermelon-garden-web.zip'
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        source = (output / name).resolve()
        if not source.is_relative_to(output.resolve()) or not source.is_file():
            raise ValueError(f'Invalid release resource: {name}')
        archive.write(source, name)
with ZipFile(destination) as archive:
    assert len(archive.namelist()) == len(set(archive.namelist()))
print(f'Release verified: {len(files)} files, {destination.stat().st_size} bytes')
