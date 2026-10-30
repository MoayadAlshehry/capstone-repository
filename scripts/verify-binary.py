#!/usr/bin/env python3
"""Verify the source-only install's approved Linux-amd64 codec before use."""
from pathlib import Path
import hashlib,json,subprocess,os,platform
SOURCE=Path(__file__).resolve().parent.parent
def verify(root,expected=None):
 root=Path(root).resolve();pin=expected or json.loads((SOURCE/'third_party/binary-fingerprints.json').read_text())
 if platform.system()!='Linux' or platform.machine().lower() not in ['x86_64','amd64']:raise RuntimeError('NOT_SUPPORTED_YET_CODEC_PLATFORM')
 code="const r=require('node:module').createRequire(process.cwd()+'/package.json');console.log(JSON.stringify({bin:r('ffmpeg-static'),manifest:r.resolve('ffmpeg-static/package.json')}))"
 env=os.environ.copy()
 for key in ['FFMPEG_BIN','FFMPEG_BINARY_RELEASE','FFMPEG_BINARIES_URL']:env.pop(key,None)
 result=json.loads(subprocess.check_output(['node','-e',code],cwd=root,env=env,text=True));binary=Path(result['bin']);manifest=Path(result['manifest']);package=json.loads(manifest.read_text())
 if binary.is_symlink() or not binary.resolve().is_relative_to(root) or not manifest.resolve().is_relative_to(root):raise RuntimeError('UNOWNED_CODEC_PATH')
 if package['name']!='ffmpeg-static' or package['version']!=pin['npm_version']:raise RuntimeError('UNEXPECTED_CODEC_PACKAGE_VERSION')
 actual=hashlib.sha256(binary.read_bytes()).hexdigest()
 if actual!=pin['executable_sha256'] or binary.stat().st_size!=pin['executable_bytes']:raise RuntimeError('CODEC_HASH_MISMATCH_STOPPED_BEFORE_USE')
 license_file=binary.with_name(binary.name+'.LICENSE')
 if hashlib.sha256(license_file.read_bytes()).hexdigest()!=pin['license_sha256']:raise RuntimeError('CODEC_LICENSE_MISMATCH')
 return {'package':package['version'],'binary_sha256':actual,'license_sha256':pin['license_sha256'],'verified':True}
if __name__=='__main__':
 try:verify(SOURCE);print('VERIFIED | Approved codec package, binary bytes and upstream GPL notice')
 except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as e:print('STOP | '+str(e));raise SystemExit(1)
