import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const fmt = (d) => new Date(d).toLocaleString('es', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })

function formatNameFromEmail(email) {
  if (!email) return ''
  return email.includes('@') ? email.split('@')[0] : email
}

function calcPoints(pred, match) {
  if (match.home_score === undefined || match.away_score === undefined) return null
  let pts = 0
  const ph = pred.home_score, pa = pred.away_score
  const mh = match.home_score, ma = match.away_score
  if (ph === null || pa === null || mh === null || ma === null) return null
  const predResult = ph > pa ? 'H' : ph < pa ? 'A' : 'D'
  const matchResult = mh > ma ? 'H' : mh < ma ? 'A' : 'D'
  if (predResult === matchResult) pts += 1
  if (ph === mh && pa === ma) pts += 1
  const predArr = pred.scorers || pred.prediction_scorers || []
  const matchArr = match.scorers || match.match_scorers || []
  if (predArr.length && matchArr.length) {
    const predS = predArr.map(s => (s.player_name || s.name || s).toString().trim().toLowerCase())
    const matchS = matchArr.map(s => (s.player_name || s.name || s).toString().trim().toLowerCase())
    if (predS.some(s => matchS.includes(s))) pts += 1
  }
  return pts
}

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('matches')

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await sb.auth.getSession()
      if (data?.session) {
        await loadProfile(data.session.user)
      } else if (mounted) {
        setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) loadProfile(session.user)
      else if (mounted) {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile(user) {
    setUser(user)

    let profileData = null
    const { data, error } = await sb.from('profiles').select('id, name, email, role').eq('id', user.id).maybeSingle()
    if (error) {
      console.error('Error fetching profile by id:', error.message)
    }

    if (data) {
      profileData = data
    } else if (user.email) {
      const { data: emailData, error: emailError } = await sb.from('profiles').select('id, name, email, role').eq('email', user.email).maybeSingle()
      if (emailError) {
        console.error('Error fetching profile by email:', emailError.message)
      }
      profileData = emailData
    }

    const authName = user.user_metadata?.full_name || user.user_metadata?.name || ''
    const fallbackName = authName || formatNameFromEmail(user.email)

    if (profileData) {
      const name = (profileData.name || '').trim()
      if (!name || name === profileData.email) {
        if (authName) {
          const updatedName = authName
          const { error: updateError } = await sb.from('profiles').update({ name: updatedName }).eq('id', profileData.id)
          if (updateError) {
            console.error('Error updating profile name:', updateError.message)
          }
          setProfile({ ...profileData, name: updatedName })
        } else {
          setProfile(profileData)
        }
      } else {
        setProfile(profileData)
      }
      setLoading(false)
      return
    }

    const profilePayload = {
      id: user.id,
      email: user.email,
      name: fallbackName,
      role: 'user'
    }

    const { data: inserted, error: insertError } = await sb.from('profiles').insert(profilePayload).select().single()
    if (insertError) {
      console.error('Error creating profile:', insertError.message)
      setProfile(profilePayload)
    } else {
      setProfile(inserted)
    }

    setLoading(false)
  }

  async function logout() {
    await sb.auth.signOut()
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:40 }}>⚽</div>
      <div style={{ color:'var(--muted)' }}>Cargando...</div>
    </div>
  )

  if (!user) return <AuthPage />

  const isAdmin = profile?.role === 'admin'

  return (
    <div style={{ maxWidth:780, margin:'0 auto', padding:'0 16px 40px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 0 16px', borderBottom:'1px solid var(--border)', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:28 }}>⚽</span>
          <div>
            <div style={{ fontWeight:700, fontSize:18, letterSpacing:-0.5 }}>Quiniela Mundial</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>
              Hola, {profile?.name || user.user_metadata?.full_name || user.user_metadata?.name || formatNameFromEmail(user.email)} {isAdmin && <span className="tag tag-admin">Admin</span>}
            </div>
          </div>
        </div>
        <button className="btn-ghost" onClick={logout} style={{ fontSize:13 }}>Salir</button>
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--bg2)', padding:4, borderRadius:8, border:'1px solid var(--border)' }}>
        <button className={`nav-tab${page==='matches'?' active':''}`} onClick={() => setPage('matches')}>Partidos</button>
        <button className={`nav-tab${page==='ranking'?' active':''}`} onClick={() => setPage('ranking')}>Tabla</button>
        {isAdmin && <button className={`nav-tab${page==='admin'?' active':''}`} onClick={() => setPage('admin')}>⚙ Admin</button>}
      </div>

      {page === 'matches' && <MatchesPage userId={user.id} />}
      {page === 'ranking' && <RankingPage />}
      {page === 'admin' && isAdmin && <AdminPage />}
    </div>
  )
}

function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await sb.auth.signInWithPassword({ email, password: pass })
    if (error) setErr(error.message)
    setBusy(false)
  }

  async function handleRegister(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    if (!name.trim()) { setErr('Escribe tu nombre'); setBusy(false); return }

    const { data, error } = await sb.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name.trim() } }
    })

    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }

    if (data.user) {
      const profilePayload = {
        id: data.user.id,
        email,
        name: name.trim(),
        role: 'user'
      }
      const { error: upsertError } = await sb.from('profiles').upsert(profilePayload, { onConflict: 'id' })
      if (upsertError) {
        console.error('Error saving profile after sign-up:', upsertError.message)
      }
      setOk('¡Cuenta creada! Ya puedes hacer login.')
      setMode('login')
    }

    setBusy(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:52 }}>⚽</div>
          <h1 style={{ fontSize:26, fontWeight:700, marginTop:8, letterSpacing:-0.5 }}>Quiniela Mundial</h1>
          <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>Predice, compite, gana</p>
        </div>
        <div className="card">
          <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--bg3)', padding:4, borderRadius:6 }}>
            <button className={`nav-tab${mode==='login'?' active':''}`} onClick={() => setMode('login')} style={{ flex:1 }}>Entrar</button>
            <button className={`nav-tab${mode==='register'?' active':''}`} onClick={() => setMode('register')} style={{ flex:1 }}>Registrarse</button>
          </div>
          {err && <div className="error-msg" style={{ marginBottom:12 }}>{err}</div>}
          {ok && <div className="success-msg" style={{ marginBottom:12 }}>{ok}</div>}
          <form onSubmit={mode==='login' ? handleLogin : handleRegister} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {mode==='register' && <input placeholder="Tu nombre" value={name} onChange={e=>setName(e.target.value)} required />}
            <input type="email" placeholder="Correo electrónico" value={email} onChange={e=>setEmail(e.target.value)} required />
            <input type="password" placeholder="Contraseña (mín. 6 caracteres)" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6} />
            <button type="submit" className="btn-primary" style={{ marginTop:4 }} disabled={busy}>{busy ? 'Un momento...' : mode==='login' ? 'Entrar' : 'Crear cuenta'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}

function MatchesPage({ userId }) {
  const [matches, setMatches] = useState([])
  const [preds, setPreds] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: ms } = await sb.from('matches').select('*').order('match_date', { ascending: true })
    const { data: ps } = await sb.from('predictions').select('*, prediction_scorers(*)').eq('user_id', userId)
    const predMap = {}
    ;(ps || []).forEach(p => { predMap[p.match_id] = p })
    setMatches(ms || [])
    setPreds(predMap)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ color:'var(--muted)', textAlign:'center', padding:40 }}>Cargando partidos...</div>

  if (!matches.length) return (
    <div className="card" style={{ textAlign:'center', padding:40 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
      <div style={{ color:'var(--muted)' }}>Aún no hay partidos. El administrador los agregará pronto.</div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {matches.map(m => (
        <MatchCard key={m.id} match={m} myPred={preds[m.id]} userId={userId} onRefresh={load} />
      ))}
    </div>
  )
}

function MatchCard({ match, myPred, userId, onRefresh }) {
  const [open, setOpen] = useState(false)
  const isFinished = match.home_score !== null && match.away_score !== null
  const pts = myPred && isFinished ? calcPoints(myPred, { ...match, scorers: match.match_scorers }) : null

  return (
    <div className="card" style={{ border: isFinished ? '1px solid rgba(46,160,67,0.3)' : '1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>{fmt(match.match_date)} · {match.stage || 'Fase de grupos'}</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ textAlign:'center', minWidth:80 }}>
              <div className="flag">{match.home_flag || '🏳️'}</div>
              <div style={{ fontSize:13, fontWeight:600, marginTop:2 }}>{match.home_team}</div>
            </div>
            <div style={{ textAlign:'center' }}>
              {isFinished ? (
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <div className="score-bubble">{match.home_score}</div>
                  <span style={{ color:'var(--muted)' }}>-</span>
                  <div className="score-bubble">{match.away_score}</div>
                </div>
              ) : <div style={{ color:'var(--muted)', fontSize:20, fontWeight:700 }}>vs</div>}
            </div>
            <div style={{ textAlign:'center', minWidth:80 }}>
              <div className="flag">{match.away_flag || '🏳️'}</div>
              <div style={{ fontSize:13, fontWeight:600, marginTop:2 }}>{match.away_team}</div>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
          {myPred ? (
            <>
              <span className="tag tag-done">✓ Enviada</span>
              {pts !== null && <span className="pts-badge">{pts} pts</span>}
            </>
          ) : isFinished ? (
            <span className="tag" style={{ background:'rgba(218,54,51,0.15)', color:'var(--red)' }}>Sin predicción</span>
          ) : (
            <span className="tag tag-pending">Pendiente</span>
          )}
          {!myPred && !isFinished && (
            <button className="btn-primary" style={{ fontSize:13 }} onClick={() => setOpen(true)}>Predecir</button>
          )}
          {myPred && (
            <button className="btn-ghost" style={{ fontSize:12 }} onClick={() => setOpen(o => !o)}>
              {open ? 'Ocultar' : 'Ver mi predicción'}
            </button>
          )}
        </div>
      </div>

      {open && (
        myPred ? <PredView pred={myPred} match={match} /> : <PredForm match={match} userId={userId} onDone={() => { setOpen(false); onRefresh(); }} />
      )}
    </div>
  )
}

function PredView({ pred, match }) {
  return (
    <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>Tu predicción</div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <div className="score-bubble" style={{ fontSize:16 }}>{pred.home_score}</div>
        <span style={{ color:'var(--muted)' }}>-</span>
        <div className="score-bubble" style={{ fontSize:16 }}>{pred.away_score}</div>
        <span style={{ fontSize:13, color:'var(--muted)', marginLeft:8 }}>{match.home_team} vs {match.away_team}</span>
      </div>
      {pred.prediction_scorers?.length > 0 && (
        <div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>Goleadores elegidos</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {pred.prediction_scorers.map((s,i) => (
              <span key={i} style={{ background:'var(--bg3)', padding:'3px 10px', borderRadius:20, fontSize:12 }}>
                ⚽ {s.player_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PredForm({ match, userId, onDone }) {
  const [hs, setHs] = useState('')
  const [as_, setAs] = useState('')
  const [scorerName, setScorerName] = useState('')
  const [scorers, setScorers] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function addScorer() {
    const name = scorerName.trim()
    if (!name) return
    if (scorers.find(s => s.toLowerCase() === name.toLowerCase())) { setErr('Ya agregaste ese jugador'); return }
    setScorers(prev => [...prev, name])
    setScorerName('')
    setErr('')
  }

  async function submit() {
    if (hs === '' || as_ === '') { setErr('Ingresa el marcador'); return }
    setBusy(true)
    setErr('')
    const { data: pred, error } = await sb.from('predictions').insert({
      user_id: userId,
      match_id: match.id,
      home_score: parseInt(hs, 10),
      away_score: parseInt(as_, 10)
    }).select().single()
    if (error) { setErr(error.message); setBusy(false); return }
    if (scorers.length) {
      await sb.from('prediction_scorers').insert(scorers.map(name => ({ prediction_id: pred.id, player_name: name })))
    }
    onDone()
  }

  return (
    <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Tu predicción de marcador</div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{match.home_team}</div>
          <input type="number" min="0" max="20" value={hs} onChange={e=>setHs(e.target.value)} placeholder="0" style={{ textAlign:'center', fontSize:20, fontWeight:700 }} />
        </div>
        <div style={{ fontSize:18, color:'var(--muted)', paddingTop:20 }}>-</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{match.away_team}</div>
          <input type="number" min="0" max="20" value={as_} onChange={e=>setAs(e.target.value)} placeholder="0" style={{ textAlign:'center', fontSize:20, fontWeight:700 }} />
        </div>
      </div>
      <hr className="divider" />
      <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>Goleadores (opcional, 1 pto cada uno si aciertas)</div>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input placeholder="Nombre del jugador" value={scorerName} onChange={e=>setScorerName(e.target.value)} onKeyDown={e => e.key==='Enter' && (e.preventDefault(), addScorer())} style={{ flex:1 }} />
        <button className="btn-ghost" onClick={addScorer} style={{ whiteSpace:'nowrap' }}>+ Agregar</button>
      </div>
      {scorers.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
          {scorers.map((s,i) => (
            <span key={i} style={{ background:'var(--bg3)', padding:'3px 10px', borderRadius:20, fontSize:12, cursor:'pointer' }} onClick={() => setScorers(prev => prev.filter((_,j)=>j!==i))}>⚽ {s} ×</span>
          ))}
        </div>
      )}
      {err && <div className="error-msg" style={{ marginBottom:10 }}>{err}</div>}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button className="btn-green" onClick={submit} disabled={busy}>{busy ? 'Guardando...' : 'Enviar predicción'}</button>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>⚠ Una vez enviada no podrás modificarla</div>
    </div>
  )
}

function RankingPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  // Load function moved to component scope so it can be re-used by realtime listeners and the Refresh button
  const load = async () => {
    const { data: profiles } = await sb.from('profiles').select('id, name, email')
    const { data: matches } = await sb.from('matches').select('*')
    const { data: preds } = await sb.from('predictions').select('*, prediction_scorers(*)')
    const { data: matchScorers } = await sb.from('match_scorers').select('*')

    const finishedMatches = (matches || []).filter(m => m.home_score !== null && m.away_score !== null)
    const scorersByMatch = {}
    ;(matchScorers || []).forEach(ms => {
      if (!scorersByMatch[ms.match_id]) scorersByMatch[ms.match_id] = []
      scorersByMatch[ms.match_id].push(ms)
    })

    const userPts = {}
    ;(profiles || []).forEach(p => { userPts[p.id] = { name: p.name || p.email || p.id, total: 0, correct: 0, exact: 0, scorers: 0 } })

    // Ensure we account for any user_ids that have predictions but no profile row
    ;(preds || []).forEach(pred => {
      if (!userPts[pred.user_id]) {
        userPts[pred.user_id] = { name: pred.user_id, total: 0, correct: 0, exact: 0, scorers: 0 }
      }
    })

    ;(preds || []).forEach(pred => {
      const match = finishedMatches.find(m => m.id === pred.match_id)
      if (!match) return
      const matchWithScorers = { ...match, scorers: scorersByMatch[match.id] || [] }
      const predWithScorers = { ...pred, scorers: pred.prediction_scorers }
      const pts = calcPoints(predWithScorers, matchWithScorers)
      if (pts === null) return
      // initialize user entry if missing (extra safety)
      if (!userPts[pred.user_id]) userPts[pred.user_id] = { name: pred.user_id, total: 0, correct: 0, exact: 0, scorers: 0 }
      userPts[pred.user_id].total += pts
      const ph = pred.home_score, pa = pred.away_score
      const mh = match.home_score, ma = match.away_score
      const pr = ph > pa ? 'H' : ph < pa ? 'A' : 'D'
      const mr = mh > ma ? 'H' : mh < ma ? 'A' : 'D'
      if (pr === mr) userPts[pred.user_id].correct++
      if (ph === mh && pa === ma) userPts[pred.user_id].exact++
      const predS = (pred.prediction_scorers || []).map(s => (s.player_name || '').toString().toLowerCase())
      const matchS = (scorersByMatch[match.id] || []).map(s => (s.player_name || '').toString().toLowerCase())
      if (predS.some(s => matchS.includes(s))) userPts[pred.user_id].scorers++
    })

    const sorted = Object.entries(userPts).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.total - a.total)
    setRows(sorted)
    setLoading(false)
  }

  useEffect(() => {
    load()

    // Realtime listeners: reload table when relevant changes occur
    const channel = sb.channel('realtime-ranking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_scorers' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_scorers' }, () => { load() })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  if (loading) return <div style={{ color:'var(--muted)', textAlign:'center', padding:40 }}>Calculando puntos...</div>

  const medals = ['🥇', '🥈', '🥉']
  return (
    <div>
      <h2 style={{ fontSize:16, fontWeight:500, marginBottom:16 }}>Tabla de posiciones</h2>
      {rows.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Aún no hay partidos finalizados</div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr style={{ background:'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'var(--muted)', width:40 }}>#</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'var(--muted)' }}>Jugador</th>
                <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'var(--muted)' }}>Pts</th>
                <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'var(--muted)' }}>Resultados</th>
                <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'var(--muted)' }}>Exactos</th>
                <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'var(--muted)' }}>Goleadores</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom:'1px solid var(--border)', background: i===0 ? 'rgba(247,183,49,0.05)' : 'transparent' }}>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>{medals[i] || i+1}</td>
                  <td style={{ padding:'12px 16px', fontWeight: i<3 ? 500 : 400 }}>{r.name}</td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}><span className="pts-badge">{r.total}</span></td>
                  <td style={{ padding:'12px 16px', textAlign:'center', color:'var(--muted)' }}>{r.correct}</td>
                  <td style={{ padding:'12px 16px', textAlign:'center', color:'var(--muted)' }}>{r.exact}</td>
                  <td style={{ padding:'12px 16px', textAlign:'center', color:'var(--muted)' }}>{r.scorers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdminPage() {
  const [tab, setTab] = useState('matches')
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <button className={`nav-tab${tab==='matches'?' active':''}`} onClick={()=>setTab('matches')}>Partidos</button>
        <button className={`nav-tab${tab==='results'?' active':''}`} onClick={()=>setTab('results')}>Cargar resultados</button>
      </div>
      {tab==='matches' && <AdminMatches />}
      {tab==='results' && <AdminResults />}
    </div>
  )
}

function AdminMatches() {
  const [matches, setMatches] = useState([])
  const [form, setForm] = useState({ home_team:'', away_team:'', home_flag:'', away_flag:'', match_date:'', stage:'Fase de grupos' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await sb.from('matches').select('*').order('match_date')
    setMatches(data || [])
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!form.home_team || !form.away_team || !form.match_date) { setErr('Completa todos los campos'); return }
    setBusy(true); setErr('')
    if (editing) {
      await sb.from('matches').update(form).eq('id', editing)
    } else {
      await sb.from('matches').insert(form)
    }
    setForm({ home_team:'', away_team:'', home_flag:'', away_flag:'', match_date:'', stage:'Fase de grupos' })
    setEditing(null)
    await load()
    setBusy(false)
  }

  async function del(id) {
    if (!confirm('¿Eliminar este partido?')) return
    await sb.from('predictions').delete().eq('match_id', id)
    await sb.from('match_scorers').delete().eq('match_id', id)
    await sb.from('matches').delete().eq('id', id)
    await load()
  }

  function startEdit(m) {
    setEditing(m.id)
    setForm({ home_team: m.home_team, away_team: m.away_team, home_flag: m.home_flag||'', away_flag: m.away_flag||'', match_date: m.match_date?.slice(0,16) || '', stage: m.stage||'' })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div className="card">
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>{editing ? 'Editar partido' : 'Agregar partido'}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Equipo local</div>
            <input placeholder="México" value={form.home_team} onChange={e=>setForm(p=>({...p,home_team:e.target.value}))} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Equipo visitante</div>
            <input placeholder="Argentina" value={form.away_team} onChange={e=>setForm(p=>({...p,away_team:e.target.value}))} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Bandera local (emoji)</div>
            <input placeholder="🇲🇽" value={form.home_flag} onChange={e=>setForm(p=>({...p,home_flag:e.target.value}))} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Bandera visitante (emoji)</div>
            <input placeholder="🇦🇷" value={form.away_flag} onChange={e=>setForm(p=>({...p,away_flag:e.target.value}))} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Fecha y hora</div>
            <input type="datetime-local" value={form.match_date} onChange={e=>setForm(p=>({...p,match_date:e.target.value}))} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Fase</div>
            <select value={form.stage} onChange={e=>setForm(p=>({...p,stage:e.target.value}))}>
              <option>Fase de grupos</option>
              <option>Octavos</option>
              <option>Cuartos</option>
              <option>Semifinal</option>
              <option>Tercer lugar</option>
              <option>Final</option>
            </select>
          </div>
        </div>
        {err && <div className="error-msg" style={{ marginTop:10 }}>{err}</div>}
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Guardando...' : editing ? 'Actualizar' : 'Agregar partido'}</button>
          {editing && <button className="btn-ghost" onClick={()=>{ setEditing(null); setForm({ home_team:'', away_team:'', home_flag:'', away_flag:'', match_date:'', stage:'Fase de grupos' }); }}>Cancelar</button>}
        </div>
      </div>

      <div>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:12 }}>Partidos creados ({matches.length})</div>
        {matches.length === 0 ? <div style={{ color:'var(--muted)', fontSize:14 }}>No hay partidos todavía.</div> : matches.map(m => (
          <div key={m.id} className="card" style={{ marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontWeight:500, fontSize:14 }}>{m.home_flag} {m.home_team} vs {m.away_team} {m.away_flag}</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{fmt(m.match_date)} · {m.stage}</div>
              {m.home_score !== null && <div style={{ fontSize:12, color:'var(--green)', marginTop:2 }}>✓ Resultado: {m.home_score} - {m.away_score}</div>}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn-ghost" style={{ fontSize:12 }} onClick={()=>startEdit(m)}>Editar</button>
              <button className="btn-danger" style={{ fontSize:12 }} onClick={()=>del(m.id)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminResults() {
  const [matches, setMatches] = useState([])
  const [selected, setSelected] = useState('')
  const [hs, setHs] = useState('')
  const [as_, setAs] = useState('')
  const [scorerName, setScorerName] = useState('')
  const [scorers, setScorers] = useState([])
  const [existing, setExisting] = useState([])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    sb.from('matches').select('*').order('match_date').then(({ data }) => setMatches(data || []))
  }, [])

  async function selectMatch(id) {
    setSelected(id)
    setErr('')
    setOk('')
    const match = matches.find(x => String(x.id) === String(id))
    if (!match) return
    setHs(match.home_score !== null ? String(match.home_score) : '')
    setAs(match.away_score !== null ? String(match.away_score) : '')
    const { data } = await sb.from('match_scorers').select('*').eq('match_id', match.id)
    setExisting(data || [])
    setScorers([])
  }

  function addScorer() {
    const name = scorerName.trim()
    if (!name) return
    setScorers(prev => [...prev, name])
    setScorerName('')
  }

  async function save() {
    if (!selected || hs === '' || as_ === '') { setErr('Selecciona un partido y el marcador'); return }
    setBusy(true)
    setErr('')
    setOk('')
    const matchId = Number(selected)
    await sb.from('matches').update({ home_score: parseInt(hs, 10), away_score: parseInt(as_, 10) }).eq('id', matchId)
    if (scorers.length) {
      await sb.from('match_scorers').insert(scorers.map(name => ({ match_id: matchId, player_name: name })))
    }
    setOk('¡Resultado guardado! Los puntos se recalcularán automáticamente.')
    const { data } = await sb.from('match_scorers').select('*').eq('match_id', matchId)
    setExisting(data || [])
    setScorers([])
    setBusy(false)
  }

  async function removeScorer(id) {
    await sb.from('match_scorers').delete().eq('id', id)
    setExisting(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="card">
      <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>Cargar resultado de partido</div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Selecciona el partido</div>
        <select value={selected} onChange={e=>selectMatch(e.target.value)}>
          <option value="">-- Elige un partido --</option>
          {matches.map(m => <option key={m.id} value={m.id}>{m.home_team} vs {m.away_team} · {fmt(m.match_date)}</option>)}
        </select>
      </div>
      {selected && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{matches.find(m=>String(m.id)===String(selected))?.home_team}</div>
              <input type="number" min="0" value={hs} onChange={e=>setHs(e.target.value)} style={{ textAlign:'center', fontSize:20, fontWeight:700 }} placeholder="0" />
            </div>
            <div style={{ fontSize:18, color:'var(--muted)', paddingTop:18 }}>-</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{matches.find(m=>String(m.id)===String(selected))?.away_team}</div>
              <input type="number" min="0" value={as_} onChange={e=>setAs(e.target.value)} style={{ textAlign:'center', fontSize:20, fontWeight:700 }} placeholder="0" />
            </div>
          </div>
          <hr className="divider" />
          <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>Goleadores del partido</div>
          {existing.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {existing.map(s => (
                <span key={s.id} style={{ background:'var(--bg3)', padding:'3px 10px', borderRadius:20, fontSize:12, cursor:'pointer' }} onClick={() => removeScorer(s.id)}>⚽ {s.player_name} ×</span>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <input placeholder="Agregar goleador" value={scorerName} onChange={e=>setScorerName(e.target.value)} onKeyDown={e => e.key==='Enter' && (e.preventDefault(), addScorer())} style={{ flex:1 }} />
            <button className="btn-ghost" onClick={addScorer}>+ Agregar</button>
          </div>
          {scorers.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {scorers.map((s,i) => (
                <span key={i} style={{ background:'rgba(46,160,67,0.15)', color:'var(--green)', padding:'3px 10px', borderRadius:20, fontSize:12, cursor:'pointer' }} onClick={() => setScorers(prev => prev.filter((_,j)=>j!==i))}>⚽ {s} ×</span>
              ))}
            </div>
          )}
        </>
      )}
      {err && <div className="error-msg" style={{ marginBottom:10 }}>{err}</div>}
      {ok && <div className="success-msg" style={{ marginBottom:10 }}>{ok}</div>}
      <button className="btn-green" onClick={save} disabled={busy || !selected}>{busy ? 'Guardando...' : 'Guardar resultado'}</button>
    </div>
  )
}
