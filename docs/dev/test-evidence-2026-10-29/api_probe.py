"""Observational probe; prints actual results, including known defects.

Run from any directory with the project Python environment. Uses a new temporary
database and does not modify application source or an existing database.
It is not a product acceptance test and does not assert that missing routes pass.
"""
import os,secrets,tempfile,json,subprocess,sys,sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[3] / 'server'
work=Path(tempfile.mkdtemp(prefix='teamsync-verification-'))
os.environ['SECRET_KEY']=secrets.token_hex(32)
os.environ['DATABASE_URL']=f'sqlite:///{work / "test.db"}'
sys.path.insert(0,str(root))
os.chdir(root)
for args in [('upgrade','head'),('current',),('downgrade','base'),('upgrade','head'),('check',)]:
    result=subprocess.run([sys.executable,'-m','alembic',*args],capture_output=True,text=True,timeout=30)
    print('MIGRATION',args,'EXIT',result.returncode,result.stdout.strip(),result.stderr.strip())
con=sqlite3.connect(work/'test.db')
print('TABLES',con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
from fastapi.testclient import TestClient
from app.main import app
from app.db import engine,get_db
from app.errors import register_exception_handlers
from fastapi import FastAPI,HTTPException
from sqlalchemy.exc import OperationalError
with engine.connect() as db:
    print('PRAGMA', {key:db.exec_driver_sql(f'PRAGMA {key}').scalar() for key in ['foreign_keys','journal_mode','busy_timeout']})
client=TestClient(app,raise_server_exceptions=False)
for method,path,data in [('GET','/health',None),('POST','/health',None),('POST','/api/v1/auth/register',{'username':'test','password':'test-pass-123','display_name':'临时测试'}),('POST','/api/v1/auth/login',{}),('GET','/api/v1/teams',None),('GET','/api/v1/teams/1/events',None),('GET','/api/v1/teams/1/tasks',None),('GET','/api/v1/notifications',None)]:
    r=client.request(method,path,json=data)
    print('HTTP',method,path,r.status_code,dict(r.headers),r.json())
print('OPENAPI_PATHS',list(app.openapi()['paths']))
class BrokenDB:
    def execute(self,*a,**kw): raise OperationalError('SELECT 1',{},Exception('test database failure'))
app.dependency_overrides[get_db]=lambda: BrokenDB()
r=client.get('/health'); print('BROKEN_DB',r.status_code,r.json())
app.dependency_overrides.clear()
probe=FastAPI();register_exception_handlers(probe)
@probe.get('/auth')
def auth(): raise HTTPException(401,'Authentication required',headers={'WWW-Authenticate':'Bearer'})
@probe.get('/rate')
def rate(): raise HTTPException(429,'Limited',headers={'Retry-After':'60'})
@probe.get('/crash')
def crash(): raise ValueError('synthetic-sensitive-content')
probe_client=TestClient(probe,raise_server_exceptions=False)
for path in ['/auth','/rate','/crash']:
    r=probe_client.get(path);print('HANDLER',path,r.status_code,dict(r.headers),r.json())
print('TEMP_DATABASE',work)
