import React, { useEffect, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseConfigured } from './supabaseClient';

const CHALLENGES = ['Redes sociais', 'Jogos', 'Pornografia', 'Álcool', 'Cigarro', 'Alimentação compulsiva', 'Procrastinação', 'Outro'];
const PLAN = ['Entenda seu gatilho', 'Mude uma situação do ambiente', 'Crie uma alternativa saudável', 'Aprenda a atravessar o impulso', 'Reforce sua motivação', 'Revise o que funcionou', 'Celebre sua evolução'];
const KEY = '@rsl_state_v2';
const initialState = { user: null, selected: [], completedDay: 0, diary: [], goal: '' };

export default function App() {
  const [state, setState] = useState(initialState);
  const [screen, setScreen] = useState('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goal, setGoal] = useState('');
  const [note, setNote] = useState('');
  const [mood, setMood] = useState('🙂');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (supabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) {
            await hydrateFromCloud(data.session.user);
            if (mounted) setScreen('home');
            return;
          }
        }
        const saved = await AsyncStorage.getItem(KEY);
        if (saved) {
          const parsed = { ...initialState, ...JSON.parse(saved) };
          setState(parsed);
          setScreen(parsed.user ? 'home' : 'welcome');
        } else setScreen('welcome');
      } catch (error) {
        console.warn('Falha ao iniciar:', error);
        if (mounted) setScreen('welcome');
      }
    })();
    const subscription = supabase?.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        await hydrateFromCloud(session.user);
        setScreen('home');
      }
    });
    return () => {
      mounted = false;
      subscription?.data?.subscription?.unsubscribe();
    };
  }, []);

  const saveLocal = async (next) => {
    setState(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

  const hydrateFromCloud = async (authUser) => {
    const [{ data: profile }, { data: progress }, { data: entries }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
      supabase.from('progress').select('*').eq('user_id', authUser.id).maybeSingle(),
      supabase.from('journal_entries').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false }).limit(50),
    ]);
    const next = {
      user: { id: authUser.id, name: profile?.name || authUser.user_metadata?.name || '', email: authUser.email || '' },
      selected: profile?.selected || [],
      completedDay: progress?.completed_day || 0,
      diary: (entries || []).map(e => ({ id: e.id, mood: e.mood, note: e.note, date: formatDate(e.entry_date || e.created_at) })),
      goal: profile?.goal || '',
    };
    await saveLocal(next);
    setName(next.user.name); setEmail(next.user.email); setGoal(next.goal);
    return next;
  };

  const createAccount = async () => {
    if (!name.trim() || !email.trim() || !password) return Alert.alert('Falta pouco', 'Informe nome, e-mail e uma senha.');
    if (password.length < 6) return Alert.alert('Senha', 'Use pelo menos 6 caracteres.');
    setBusy(true);
    try {
      if (!supabaseConfigured) {
        const next = { ...state, user: { name: name.trim(), email: email.trim() }, goal: goal.trim() };
        await saveLocal(next); setScreen('assessment'); return;
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
      if (error) throw error;
      if (!data.user) throw new Error('Não foi possível criar a conta.');
      const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, name: name.trim(), goal: goal.trim(), selected: [] });
      if (profileError) throw profileError;
      await supabase.from('progress').upsert({ user_id: data.user.id, completed_day: 0 });
      if (data.session) {
        await hydrateFromCloud(data.user);
        setScreen('assessment');
      } else {
        Alert.alert('Conta criada', 'Verifique seu e-mail para confirmar a conta e depois entre no app.');
        setScreen('login');
      }
    } catch (error) { Alert.alert('Não foi possível criar a conta', error.message || 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  const login = async () => {
    if (!email.trim() || !password) return Alert.alert('Falta pouco', 'Informe e-mail e senha.');
    setBusy(true);
    try {
      if (!supabaseConfigured) {
        Alert.alert('Supabase ainda não configurado', 'Preencha o arquivo .env com a URL e a chave anon pública para ativar o login real.');
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await hydrateFromCloud(data.user);
      setScreen('home');
    } catch (error) { Alert.alert('Não foi possível entrar', error.message || 'Verifique seus dados.'); }
    finally { setBusy(false); }
  };

  const resetPassword = async () => {
    if (!email.trim()) return Alert.alert('E-mail', 'Informe seu e-mail primeiro.');
    if (!supabaseConfigured) return Alert.alert('Supabase ainda não configurado', 'Configure o projeto Supabase para usar a recuperação de senha.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) return Alert.alert('Erro', error.message);
    Alert.alert('E-mail enviado', 'Se o endereço existir, você receberá as instruções para redefinir a senha.');
  };

  const updateCloudProfile = async (next) => {
    if (!supabaseConfigured || !supabase) return;
    const userId = next.user?.id;
    if (!userId) return;
    const { error } = await supabase.from('profiles').upsert({ id: userId, name: next.user.name, goal: next.goal, selected: next.selected });
    if (error) throw error;
  };

  const toggleChallenge = async (item) => {
    const selected = state.selected.includes(item) ? state.selected.filter(x => x !== item) : [...state.selected, item];
    const next = { ...state, selected };
    await saveLocal(next);
    try { await updateCloudProfile(next); } catch (e) { console.warn(e); }
  };

  const finishDay = async () => {
    const nextDay = Math.min(state.completedDay + 1, 7);
    const next = { ...state, completedDay: nextDay };
    await saveLocal(next);
    if (supabaseConfigured && state.user?.id) {
      const { error } = await supabase.from('progress').upsert({ user_id: state.user.id, completed_day: nextDay });
      if (error) Alert.alert('Sincronização', 'O progresso foi salvo no aparelho, mas não conseguimos sincronizar agora.');
    }
  };

  const saveDiary = async () => {
    if (!note.trim()) return Alert.alert('Seu registro', 'Escreva pelo menos algumas palavras sobre o seu dia.');
    setBusy(true);
    try {
      if (supabaseConfigured && state.user?.id) {
        const { data, error } = await supabase.from('journal_entries').insert({ user_id: state.user.id, mood, note: note.trim() }).select().single();
        if (error) throw error;
        const entry = { id: data.id, mood: data.mood, note: data.note, date: formatDate(data.entry_date || data.created_at) };
        await saveLocal({ ...state, diary: [entry, ...state.diary] });
      } else {
        const entry = { id: Date.now(), mood, note: note.trim(), date: formatDate(new Date()) };
        await saveLocal({ ...state, diary: [entry, ...state.diary] });
      }
      setNote(''); setScreen('home');
    } catch (error) { Alert.alert('Não foi possível salvar', error.message || 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { if (supabaseConfigured && supabase) await supabase.auth.signOut(); } finally {
      await AsyncStorage.removeItem(KEY); setState(initialState); setName(''); setEmail(''); setPassword(''); setGoal(''); setScreen('welcome'); setBusy(false);
    }
  };

  if (screen === 'loading') return <Screen><Text style={styles.logo}>R_Sejamos<Text style={styles.gold}>luz</Text></Text><Text style={styles.muted}>Carregando sua jornada...</Text></Screen>;

  if (screen === 'welcome') return <Screen>
    <Text style={styles.logo}>R_Sejamos<Text style={styles.gold}>luz</Text></Text><Text style={styles.slogan}>Enxergue. Reconheça. Mude.</Text>
    <Text style={styles.hero}>Você não é o seu erro. O erro mostra o que precisa mudar.</Text>
    <Text style={styles.muted}>Um espaço para entender padrões, construir novos hábitos e acompanhar sua evolução — sem julgamento.</Text>
    <Button text="Criar minha conta" onPress={() => setScreen('signup')} disabled={busy} /><Button text="Já tenho uma conta" onPress={() => setScreen('login')} disabled={busy} secondary />
    <Text style={styles.note}>{supabaseConfigured ? 'Seus dados podem ser sincronizados com sua conta.' : 'Modo de demonstração ativo. Configure o Supabase para ativar contas e sincronização.'}</Text>
  </Screen>;

  if (screen === 'signup') return <Screen>
    <Header title="Criar conta" /><Text style={styles.title}>Vamos começar.</Text><Text style={styles.muted}>Sua conta permite encontrar sua jornada mesmo em outro aparelho.</Text>
    <Input label="Nome" value={name} onChangeText={setName} placeholder="Como podemos chamar você?" autoCapitalize="words" />
    <Input label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" />
    <Input label="Senha" value={password} onChangeText={setPassword} placeholder="Mínimo de 6 caracteres" secureTextEntry />
    <Input label="Seu objetivo" value={goal} onChangeText={setGoal} placeholder="O que você quer mudar?" autoCapitalize="sentences" />
    <Button text={busy ? 'Criando...' : 'Criar conta'} onPress={createAccount} disabled={busy} /><Button text="Voltar" onPress={() => setScreen('welcome')} secondary />
    <Text style={styles.note}>Nunca guardamos sua senha em uma tabela própria. A autenticação fica com o Supabase Auth.</Text>
  </Screen>;

  if (screen === 'login') return <Screen>
    <Header title="Entrar" /><Text style={styles.title}>Bem-vindo de volta.</Text><Text style={styles.muted}>Entre para continuar sua jornada.</Text>
    <Input label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" />
    <Input label="Senha" value={password} onChangeText={setPassword} placeholder="Sua senha" secureTextEntry />
    <Button text={busy ? 'Entrando...' : 'Entrar'} onPress={login} disabled={busy} />
    <TouchableOpacity onPress={resetPassword} disabled={busy}><Text style={styles.link}>Esqueci minha senha</Text></TouchableOpacity>
    <Button text="Criar uma conta" onPress={() => setScreen('signup')} secondary />
  </Screen>;

  if (screen === 'assessment') return <Screen><Header title="Sua avaliação • 1/2" /><Text style={styles.title}>O que mais está atrapalhando você hoje?</Text><Text style={styles.muted}>Escolha uma ou mais opções. Isso serve para personalizar seu primeiro plano.</Text>{CHALLENGES.map(c => <Option key={c} text={c} active={state.selected.includes(c)} onPress={() => toggleChallenge(c)} />)}<Button text="Criar meu plano" onPress={() => setScreen('triggers')} disabled={!state.selected.length || busy} /></Screen>;

  if (screen === 'triggers') return <Screen><Header title="Sua avaliação • 2/2" /><Text style={styles.title}>Qual é seu principal gatilho?</Text><Text style={styles.muted}>Escolha o que mais aparece antes do comportamento.</Text>{['Estresse / ansiedade', 'Tédio', 'Solidão', 'Cansaço', 'Problemas emocionais', 'Ambiente / amigos', 'Outro'].map(x => <Option key={x} text={x} onPress={() => {}} />)}<Button text="Ver meu plano" onPress={() => setScreen('plan')} /></Screen>;

  if (screen === 'plan') return <Screen><Header title="Seu plano de 7 dias" /><Text style={styles.title}>Vamos começar pequeno.</Text><Text style={styles.muted}>Seu objetivo não é ser perfeito. É aprender com cada dia.</Text>{PLAN.map((x, i) => <TouchableOpacity key={x} style={styles.task} onPress={i === state.completedDay ? finishDay : undefined}><Text style={styles.day}>{i + 1}</Text><Text style={styles.taskText}>{x}</Text><Text style={styles.check}>{i < state.completedDay ? '✓' : i === state.completedDay ? '→' : '○'}</Text></TouchableOpacity>)}<Button text="Ir para início" onPress={() => setScreen('home')} /></Screen>;

  if (screen === 'home') return <Screen><Header title="R_Sejamosluz" /><Text style={styles.title}>Olá, {state.user?.name || 'amigo'}! 👋</Text><Text style={styles.muted}>Cada pequeno passo também é uma conquista.</Text><View style={styles.progress}><Text style={styles.progressBig}>{state.completedDay}</Text><Text style={styles.muted}>de 7 dias concluídos</Text></View><Button text="Estou prestes a cair" onPress={() => setScreen('support')} danger /><View style={styles.grid}><SmallButton text="📔 Diário" onPress={() => setScreen('diary')} /><SmallButton text="📊 Evolução" onPress={() => setScreen('progress')} /><SmallButton text="🎯 Meu plano" onPress={() => setScreen('plan')} /><SmallButton text="💡 Ferramentas" onPress={() => setScreen('support')} /></View><Text style={styles.section}>Seu foco</Text><Text style={styles.muted}>{state.selected.length ? state.selected.join(' • ') : 'Defina um objetivo para começar.'}</Text><TouchableOpacity onPress={logout} disabled={busy}><Text style={styles.link}>{busy ? 'Saindo...' : 'Sair da conta'}</Text></TouchableOpacity></Screen>;

  if (screen === 'support') return <Screen><Header title="Estou prestes a cair" /><Text style={styles.title}>Pare por alguns minutos.</Text><Text style={styles.hero}>Você não precisa decidir tudo agora. Primeiro, atravesse este momento.</Text><SmallButton text="🌬️ Respirar por 3 minutos" onPress={() => Alert.alert('Respire', 'Inspire devagar. Segure por alguns segundos. Solte lentamente. Repita por 3 minutos.')} /><SmallButton text="🎯 Lembrar meu motivo" onPress={() => Alert.alert('Seu motivo', state.goal || 'Você escolheu começar. Esse já é um motivo para continuar.')} /><SmallButton text="🚶 Fazer outra atividade" onPress={() => Alert.alert('Agora', 'Afaste-se do gatilho e faça uma atividade diferente por alguns minutos.')} /><SmallButton text="✍️ Escrever o que estou sentindo" onPress={() => setScreen('diary')} /><Text style={styles.note}>Se houver risco imediato, intoxicação, abstinência grave ou outra emergência, procure atendimento profissional ou de emergência.</Text><Button text="Voltar" onPress={() => setScreen('home')} /></Screen>;

  if (screen === 'diary') return <Screen><Header title="Diário" /><Text style={styles.title}>Como você está hoje?</Text><Text style={styles.muted}>Registre sem julgamento. Isso ajuda a encontrar padrões.</Text><View style={styles.moods}>{['😞','😐','🙂','😄','🤩'].map(m => <TouchableOpacity key={m} onPress={() => setMood(m)}><Text style={[styles.mood, mood === m && styles.moodActive]}>{m}</Text></TouchableOpacity>)}</View><TextInput value={note} onChangeText={setNote} placeholder="O que aconteceu hoje?" placeholderTextColor="#71818D" multiline style={styles.inputArea} /><Button text={busy ? 'Salvando...' : 'Salvar registro'} onPress={saveDiary} disabled={busy} /><Text style={styles.section}>Últimos registros</Text>{state.diary.slice(0, 5).map(e => <View key={e.id} style={styles.entry}><Text style={styles.entryTitle}>{e.mood}  {e.date}</Text><Text style={styles.muted}>{e.note}</Text></View>)}<Button text="Voltar" onPress={() => setScreen('home')} /></Screen>;

  if (screen === 'progress') return <Screen><Header title="Evolução" /><Text style={styles.title}>Você está avançando.</Text><View style={styles.progress}><Text style={styles.progressBig}>{state.completedDay}/7</Text><Text style={styles.muted}>dias do primeiro plano</Text></View><Text style={styles.section}>Registros no diário</Text><Text style={styles.heroSmall}>{state.diary.length}</Text><Text style={styles.muted}>A evolução não é uma linha reta. Use os registros para entender o que funciona para você.</Text><Button text="Voltar" onPress={() => setScreen('home')} /></Screen>;
  return null;
}

function formatDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR'); }
function Screen({children}) { return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>{children}</ScrollView></SafeAreaView>; }
function Header({title}) { return <Text style={styles.header}>{title}</Text>; }
function Input({label, ...props}) { return <View><Text style={styles.label}>{label}</Text><TextInput {...props} placeholderTextColor="#71818D" style={styles.input} /></View>; }
function Button({text,onPress,disabled,danger,secondary}) { return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled, danger && styles.danger, secondary && styles.secondary]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{text}</Text></TouchableOpacity>; }
function SmallButton({text,onPress}) { return <TouchableOpacity onPress={onPress} style={styles.small}><Text style={styles.smallText}>{text}</Text></TouchableOpacity>; }
function Option({text,active,onPress}) { return <TouchableOpacity onPress={onPress} style={[styles.option, active && styles.optionActive]}><Text style={styles.optionText}>{text}</Text><Text style={styles.check}>{active ? '✓' : '○'}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#061521'}, container:{padding:24,gap:14,flexGrow:1}, logo:{fontSize:40,fontWeight:'800',color:'#fff',marginTop:50}, gold:{color:'#FFC72C'}, slogan:{fontSize:18,color:'#fff',marginBottom:45}, hero:{fontSize:23,lineHeight:32,color:'#fff',fontWeight:'600',marginVertical:20}, heroSmall:{fontSize:44,color:'#FFC72C',fontWeight:'900'}, header:{fontSize:20,color:'#FFC72C',fontWeight:'700',marginBottom:8}, title:{fontSize:28,color:'#fff',fontWeight:'800',marginTop:8}, muted:{color:'#A9B5BE',fontSize:16,lineHeight:24}, label:{color:'#fff',fontWeight:'700',marginTop:4}, input:{borderWidth:1,borderColor:'#31506A',borderRadius:13,padding:16,color:'#fff',fontSize:16}, inputArea:{height:160,borderWidth:1,borderColor:'#31506A',borderRadius:14,padding:16,color:'#fff',fontSize:16,textAlignVertical:'top'}, button:{backgroundColor:'#FFC72C',padding:18,borderRadius:16,alignItems:'center',marginTop:18}, buttonText:{color:'#07141D',fontSize:17,fontWeight:'800'}, disabled:{opacity:.35}, danger:{backgroundColor:'#FFB52E'}, secondary:{backgroundColor:'#0A2030',borderWidth:1,borderColor:'#31506A'}, secondaryText:{color:'#fff'}, option:{borderWidth:1,borderColor:'#31506A',borderRadius:13,padding:16,flexDirection:'row',justifyContent:'space-between'}, optionActive:{borderColor:'#FFC72C',backgroundColor:'#10283A'}, optionText:{color:'#fff',fontSize:16}, check:{color:'#FFC72C',fontWeight:'800'}, task:{borderWidth:1,borderColor:'#24445C',borderRadius:13,padding:15,flexDirection:'row',alignItems:'center',gap:12}, day:{backgroundColor:'#FFC72C',borderRadius:20,padding:8,fontWeight:'800'}, taskText:{color:'#fff',flex:1,fontSize:15}, progress:{borderWidth:1,borderColor:'#31506A',borderRadius:18,padding:25,alignItems:'center',marginVertical:15}, progressBig:{fontSize:54,color:'#FFC72C',fontWeight:'900'}, grid:{gap:10,marginTop:8}, small:{borderWidth:1,borderColor:'#31506A',borderRadius:14,padding:17,backgroundColor:'#0A2030'}, smallText:{color:'#fff',fontSize:16,fontWeight:'700'}, moods:{flexDirection:'row',justifyContent:'space-around',padding:18}, mood:{fontSize:30,opacity:.45}, moodActive:{opacity:1}, entry:{borderWidth:1,borderColor:'#24445C',borderRadius:13,padding:15,gap:7}, entryTitle:{color:'#FFC72C',fontWeight:'800'}, section:{color:'#fff',fontSize:19,fontWeight:'800',marginTop:18}, note:{color:'#82929E',fontSize:13,lineHeight:20,marginTop:8}, link:{color:'#FFC72C',textAlign:'center',marginTop:16,padding:10}
});
