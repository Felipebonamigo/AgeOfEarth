// U4: menu principal e "Criar partida" no Canvas (mesmo bronze e Cinzel do HUD). A configuracao vai pela ponte oficial
// ({"type":"novaPartida","setup":{...}}, scripts/unreal/match.ts); a simulacao recria a partida e reenvia hello + relevo + state.
#include "AoEHud.h"
#include "AoEBridgeActor.h"
#include "AoETerreno.h"
#include "CanvasItem.h"
#include "Engine/Canvas.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

namespace
{
	const TCHAR* const Deuses[] = { TEXT("zeus"), TEXT("poseidon"), TEXT("hades") };
	const TCHAR* const DeusesNome[] = { TEXT("Zeus"), TEXT("Poseidon"), TEXT("Hades") };
	const TCHAR* const Difs[] = { TEXT("facil"), TEXT("normal"), TEXT("dificil"), TEXT("muito_dificil") };
	const TCHAR* const DifsNome[] = { TEXT("Fácil"), TEXT("Normal"), TEXT("Difícil"), TEXT("Muito difícil") };
	const TCHAR* const MapasId[] = { TEXT("continental"), TEXT("mountains"), TEXT("forest"), TEXT("desert"), TEXT("lakes"), TEXT("coastal"), TEXT("islands"), TEXT("mediterranean") };
	const TCHAR* const MapasNome[] = { TEXT("Continental"), TEXT("Montanhas"), TEXT("Floresta"), TEXT("Deserto"), TEXT("Lagos"), TEXT("Costeiro"), TEXT("Ilhas"), TEXT("Mediterrâneo") };
	const TCHAR* const TamId[] = { TEXT("small"), TEXT("medium"), TEXT("large"), TEXT("huge"), TEXT("giant") };
	const TCHAR* const TamNome[] = { TEXT("Pequeno"), TEXT("Médio"), TEXT("Grande"), TEXT("Enorme"), TEXT("Gigante") };
	const TCHAR* const VitId[] = { TEXT("conquista"), TEXT("maravilhas"), TEXT("posse") };
	const TCHAR* const VitNome[] = { TEXT("Conquista"), TEXT("Maravilhas (pontos)"), TEXT("Posse de maravilhas") };
	const TCHAR* const EraNome[] = { TEXT("Arcaica"), TEXT("Clássica"), TEXT("Helenística"), TEXT("Bizantina"), TEXT("da Pólvora"), TEXT("Industrial"), TEXT("Moderna"), TEXT("dos Titãs") };
	// as 12 cores da simulacao (PLAYER_COLORS), na ordem dos lugares abertos
	const uint32 Cores[12] = { 0x3b82f6, 0xef4444, 0x22c55e, 0xeab308, 0xf97316, 0x6d28d9, 0x22d3ee, 0xf472b6, 0xf1f5f9, 0x92400e, 0xbef264, 0x475569 };
	FLinearColor Cor(int32 I) { const uint32 V = Cores[FMath::Clamp(I, 0, 11)]; return FLinearColor::FromSRGBColor(FColor((V >> 16) & 0xFF, (V >> 8) & 0xFF, V & 0xFF)); }
	constexpr int32 MaxVagas = 12;
	// ids dos botoes
	enum : int32 { IdJogar = 1, IdSair = 2, IdVagasMenos = 20, IdVagasMais = 21, IdMapa = 30, IdTamanho = 31, IdSemente = 32, IdEraIni = 40, IdEraFim = 41, IdVit = 42, IdRev = 43, IdPresetTodos = 50, IdPresetDuplas = 51, IdPresetUmContraTodos = 52, IdComecar = 90, IdVoltar = 91, IdTipo = 100, IdDeus = 200, IdEquipe = 300, IdDif = 400 };
}

void AAoEHud::IniciarMenu()
{
	bMenu = true; Tela = ETela::Principal; ErroMenu.Reset();
	Vagas.Reset();
	for (int32 i = 0; i < 4; ++i) { FVaga V; V.Tipo = i == 0 ? 0 : 1; V.Deus = i % 3; V.Equipe = i + 1; V.Dif = 1; Vagas.Add(V); }
	// ganchos de captura e teste: -AoEMenuTela=criar -AoEMenuVagas=12 -AoEMenuTimes -AoEMenuTamanho=4 -AoEMenuMapa=3 -AoEMenuJogar
	FString Tl; if (FParse::Value(FCommandLine::Get(), TEXT("AoEMenuTela="), Tl) && Tl == TEXT("criar")) Tela = ETela::Criar;
	int32 N = 0; if (FParse::Value(FCommandLine::Get(), TEXT("AoEMenuVagas="), N) && N >= 2) MenuInstalarRapido(FMath::Min(N, MaxVagas), FParse::Param(FCommandLine::Get(), TEXT("AoEMenuTimes")));
	int32 T = 0; if (FParse::Value(FCommandLine::Get(), TEXT("AoEMenuTamanho="), T)) MapaTamanho = FMath::Clamp(T, TamanhoMinimo(AbertasCount()), 4);
	int32 Mp = 0; if (FParse::Value(FCommandLine::Get(), TEXT("AoEMenuMapa="), Mp)) MapaTipo = FMath::Clamp(Mp, 0, 7);
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEMenuJogar"))) { Tela = ETela::Criar; bAutoJogar = true; }
}

int32 AAoEHud::AbertasCount() const { int32 N = 0; for (const FVaga& V : Vagas) if (V.Tipo != 2) ++N; return N; }

int32 AAoEHud::TamanhoMinimo(int32 Abertas) const
{
	// mesma tabela de scripts/unreal/match.ts (MIN_SIZE_FOR_PLAYERS): <=4 pequeno, <=6 medio, <=8 grande, <=10 enorme, <=12 gigante
	return Abertas <= 4 ? 0 : Abertas <= 6 ? 1 : Abertas <= 8 ? 2 : Abertas <= 10 ? 3 : 4;
}

bool AAoEHud::Btn(const FString& Rotulo, float X, float Y, float W, float H, int32 Id, bool bAtivo, bool bDestaque, int32 Fonte)
{
	Panel(X, Y, W, H, bAtivo ? (bDestaque ? 1.f : 0.85f) : 0.4f);
	if (bDestaque) { FCanvasTileItem T(FVector2D(X + 3, Y + 3), FVector2D(W - 6, H - 6), FLinearColor(0.85f, 0.62f, 0.2f, 0.18f)); T.BlendMode = SE_BLEND_Translucent; Canvas->DrawItem(T); }
	const FLinearColor C = bAtivo ? FLinearColor(0.95f, 0.9f, 0.75f) : FLinearColor(0.5f, 0.5f, 0.5f);
	const FVector2D M = Measure(Rotulo, Fonte);
	Text(Rotulo, X + (W - (float)M.X) * 0.5f, Y + (H - (float)M.Y) * 0.5f + 5.f, Fonte, C);   // +5: a grega do painel ocupa a borda de cima
	if (bAtivo) { FHit Ht; Ht.R = FBox2D(FVector2D(X, Y), FVector2D(X + W, Y + H)); Ht.Id = Id; Hits.Add(Ht); }
	return true;
}

void AAoEHud::MenuClick(float X, float Y)
{
	for (int32 i = Hits.Num() - 1; i >= 0; --i) if (Hits[i].R.IsInside(FVector2D(X, Y))) { MenuAcao(Hits[i].Id); return; }
}

void AAoEHud::MenuInstalarRapido(int32 N, bool bTimes)
{
	Vagas.Reset();
	for (int32 i = 0; i < N; ++i) { FVaga V; V.Tipo = i == 0 ? 0 : 1; V.Deus = i % 3; V.Equipe = bTimes ? (i % 2) + 1 : i + 1; V.Dif = 1; Vagas.Add(V); }
	MapaTamanho = FMath::Max(MapaTamanho, TamanhoMinimo(AbertasCount()));
}

void AAoEHud::MenuAcao(int32 Id)
{
	ErroMenu.Reset();
	if (Tela == ETela::Principal)
	{
		if (Id == IdJogar) Tela = ETela::Criar;
		else if (Id == IdSair) GetOwningPlayerController()->ConsoleCommand(TEXT("quit"));
		return;
	}
	if (Tela == ETela::Carregando) return;
	// ---- Criar partida ----
	if (Id >= IdDif) { const int32 i = Id - IdDif; if (Vagas.IsValidIndex(i)) Vagas[i].Dif = (Vagas[i].Dif + 1) % 4; return; }
	if (Id >= IdEquipe) { const int32 i = Id - IdEquipe; if (Vagas.IsValidIndex(i)) Vagas[i].Equipe = Vagas[i].Equipe % MaxVagas + 1; return; }
	if (Id >= IdDeus) { const int32 i = Id - IdDeus; if (Vagas.IsValidIndex(i)) Vagas[i].Deus = (Vagas[i].Deus + 1) % 3; return; }
	if (Id >= IdTipo)
	{
		const int32 i = Id - IdTipo;
		if (Vagas.IsValidIndex(i) && i > 0) { Vagas[i].Tipo = Vagas[i].Tipo == 1 ? 2 : 1; MapaTamanho = FMath::Max(MapaTamanho, TamanhoMinimo(AbertasCount())); }
		return;
	}
	switch (Id)
	{
	case IdVagasMais: if (Vagas.Num() < MaxVagas) { FVaga V; V.Tipo = 1; V.Deus = Vagas.Num() % 3; V.Equipe = Vagas.Num() + 1; Vagas.Add(V); } break;
	case IdVagasMenos: if (Vagas.Num() > 2) Vagas.Pop(); break;
	case IdMapa: MapaTipo = (MapaTipo + 1) % 8; break;
	case IdTamanho: MapaTamanho = (MapaTamanho + 1) % 5; if (MapaTamanho < TamanhoMinimo(AbertasCount())) MapaTamanho = TamanhoMinimo(AbertasCount()); break;
	case IdSemente: Semente = (Semente * 1103515245 + 12345) & 0x7fffffff; break;
	case IdEraIni: EraIni = (EraIni + 1) % 8; if (EraFim < EraIni) EraFim = EraIni; break;
	case IdEraFim: EraFim = EraFim >= 7 ? EraIni : EraFim + 1; break;
	case IdVit: Vitoria = (Vitoria + 1) % 3; break;
	case IdRev: bRevelado = !bRevelado; break;
	case IdPresetTodos: for (int32 i = 0; i < Vagas.Num(); ++i) Vagas[i].Equipe = i + 1; break;
	case IdPresetDuplas: for (int32 i = 0; i < Vagas.Num(); ++i) Vagas[i].Equipe = i / 2 + 1; break;
	case IdPresetUmContraTodos: for (int32 i = 0; i < Vagas.Num(); ++i) Vagas[i].Equipe = i == 0 ? 1 : 2; break;
	case IdVoltar: Tela = ETela::Principal; break;
	case IdComecar: EnviarPartida(); break;
	default: break;
	}
}

void AAoEHud::EnviarPartida()
{
	AAoEBridgeActor* B = FindBridge();
	if (!B) return;
	FString Js;
	for (int32 i = 0; i < Vagas.Num(); ++i)
	{
		const FVaga& V = Vagas[i];
		const TCHAR* Tipo = V.Tipo == 0 ? TEXT("humano") : V.Tipo == 1 ? TEXT("bot") : TEXT("fechada");
		Js += FString::Printf(TEXT("%s{\"tipo\":\"%s\",\"nome\":\"%s\",\"deus\":\"%s\",\"equipe\":%d,\"dificuldade\":\"%s\"}"), i ? TEXT(",") : TEXT(""), Tipo,
			V.Tipo == 0 ? TEXT("Jogador") : *FString::Printf(TEXT("IA %d"), i + 1), Deuses[V.Deus], V.Equipe, Difs[V.Dif]);
	}
	const FString Setup = FString::Printf(TEXT("{\"jogadores\":[%s],\"mapa\":{\"tipo\":\"%s\",\"tamanho\":\"%s\",\"semente\":%d},\"regras\":{\"eraInicial\":%d,\"eraFinal\":%d,\"vitoria\":\"%s\",\"mapaRevelado\":%s}}"),
		*Js, MapasId[MapaTipo], TamId[MapaTamanho], Semente, EraIni, EraFim, VitId[Vitoria], bRevelado ? TEXT("true") : TEXT("false"));
	SerieAoEnviar = B->TerrenoSerial;
	TCarregando = 0.f;
	B->SendRaw(FString::Printf(TEXT("{\"type\":\"novaPartida\",\"setup\":%s}"), *Setup));
	B->SendRaw(TEXT("{\"type\":\"pause\",\"paused\":false}"));
	Tela = ETela::Carregando;
	UE_LOG(LogTemp, Log, TEXT("AoE: menu enviou novaPartida: %s"), *Setup);
}

void AAoEHud::DrawMenu()
{
	Hits.Reset();
	const float Sx = Canvas->SizeX, Sy = Canvas->SizeY;
	const float K = FMath::Clamp(FMath::Min(Sx / 1920.f, Sy / 1080.f), 0.6f, 2.f);
	const float Ox = (Sx - 1920.f * K) * 0.5f, Oy = (Sy - 1080.f * K) * 0.5f;
	auto X = [&](float V) { return Ox + V * K; };
	auto Y = [&](float V) { return Oy + V * K; };
	AAoEBridgeActor* B = FindBridge();
	{ FCanvasTileItem T(FVector2D(0, 0), FVector2D(Sx, Sy), FLinearColor(0.02f, 0.015f, 0.01f, Tela == ETela::Carregando ? 0.55f : 0.78f)); T.BlendMode = SE_BLEND_Translucent; Canvas->DrawItem(T); }
	const FLinearColor Ouro(0.9f, 0.72f, 0.3f), Perg(0.95f, 0.9f, 0.75f);
	auto Titulo = [&](const FString& S, float Cy, int32 Tam) { const FVector2D M = Measure(S, FMath::RoundToInt(Tam * K)); Text(S, (Sx - (float)M.X) * 0.5f, Y(Cy), FMath::RoundToInt(Tam * K), Ouro); };

	if (Tela == ETela::Principal)
	{
		Titulo(TEXT("AGE OF EARTH"), 170.f, 92);
		Titulo(TEXT("O mundo antigo à espera de um general"), 290.f, 26);
		const float W = 460.f, H = 74.f, Bx = (1920.f - W) * 0.5f;
		Btn(TEXT("Jogar"), X(Bx), Y(420.f), W * K, H * K, IdJogar, true, true, FMath::RoundToInt(28 * K));
		Btn(TEXT("Campanha (em breve)"), X(Bx), Y(510.f), W * K, H * K, 0, false, false, FMath::RoundToInt(24 * K));
		Btn(TEXT("Editor de mapas (em breve)"), X(Bx), Y(600.f), W * K, H * K, 0, false, false, FMath::RoundToInt(24 * K));
		Btn(TEXT("Opções (em breve)"), X(Bx), Y(690.f), W * K, H * K, 0, false, false, FMath::RoundToInt(24 * K));
		Btn(TEXT("Sair"), X(Bx), Y(780.f), W * K, H * K, IdSair, true, false, FMath::RoundToInt(24 * K));
		return;
	}
	if (Tela == ETela::Carregando)
	{
		TCarregando += 0.016f;
		Titulo(TEXT("Preparando a partida..."), 440.f, 54);
		Titulo(ErroMenu.IsEmpty() ? FString::Printf(TEXT("Gerando o mundo (%s, %s)"), MapasNome[MapaTipo], TamNome[MapaTamanho]) : ErroMenu, 540.f, 24);
		const int32 Pontos = (int32)(TCarregando * 2.f) % 4;
		Titulo(FString::ChrN(Pontos, TEXT('.')), 600.f, 40);
		if (B && B->TerrenoSerial != SerieAoEnviar && TCarregando > 0.8f) bMenu = false;   // a nova partida chegou
		else if (B && !B->UltimoErro.IsEmpty()) { ErroMenu = B->UltimoErro; B->UltimoErro.Reset(); Tela = ETela::Criar; }
		else if (TCarregando > 90.f) { ErroMenu = TEXT("A simulação não respondeu em 90 s."); Tela = ETela::Criar; }
		return;
	}

	// ---- Criar partida ----
	if (bAutoJogar && B && B->bHaveState && B->PonteConectada()) { bAutoJogar = false; EnviarPartida(); return; }
	Titulo(TEXT("CRIAR PARTIDA"), 46.f, 52);
	const int32 Abertas = AbertasCount();
	// coluna esquerda: jogadores
	Panel(X(40), Y(130), 1100 * K, 800 * K, 0.9f);
	Text(TEXT("Jogadores"), X(66), Y(152), FMath::RoundToInt(24 * K), Ouro);
	Text(TEXT("Cor"), X(70), Y(190), FMath::RoundToInt(15 * K), Perg);
	Text(TEXT("Lugar"), X(170), Y(190), FMath::RoundToInt(15 * K), Perg);
	Text(TEXT("Deus"), X(430), Y(190), FMath::RoundToInt(15 * K), Perg);
	Text(TEXT("Equipe"), X(640), Y(190), FMath::RoundToInt(15 * K), Perg);
	Text(TEXT("Dificuldade"), X(790), Y(190), FMath::RoundToInt(15 * K), Perg);
	const float Lh = 52.f;
	int32 CorIdx = 0;
	for (int32 i = 0; i < Vagas.Num(); ++i)
	{
		const FVaga& V = Vagas[i];
		const float Ly = 215.f + i * Lh;
		if (V.Tipo != 2) { FCanvasTileItem T(FVector2D(X(70), Y(Ly + 6)), FVector2D(36 * K, 32 * K), Cor(CorIdx++)); Canvas->DrawItem(T); }
		const TCHAR* Rot = V.Tipo == 0 ? TEXT("Você") : V.Tipo == 1 ? TEXT("Bot") : TEXT("Fechada");
		Btn(Rot, X(150), Y(Ly), 240 * K, 44 * K, IdTipo + i, i > 0, false, FMath::RoundToInt(17 * K));
		if (V.Tipo != 2)
		{
			Btn(DeusesNome[V.Deus], X(410), Y(Ly), 190 * K, 44 * K, IdDeus + i, true, false, FMath::RoundToInt(17 * K));
			Btn(FString::Printf(TEXT("Equipe %d"), V.Equipe), X(620), Y(Ly), 130 * K, 44 * K, IdEquipe + i, true, false, FMath::RoundToInt(17 * K));
			if (V.Tipo == 1) Btn(DifsNome[V.Dif], X(770), Y(Ly), 210 * K, 44 * K, IdDif + i, true, false, FMath::RoundToInt(17 * K));
		}
	}
	// base da coluna: vagas e equipes
	Btn(TEXT("-"), X(66), Y(860), 48 * K, 48 * K, IdVagasMenos, Vagas.Num() > 2, false, FMath::RoundToInt(24 * K));
	Text(FString::Printf(TEXT("%d lugares (%d abertos)"), Vagas.Num(), Abertas), X(126), Y(874), FMath::RoundToInt(16 * K), Perg);
	Btn(TEXT("+"), X(440), Y(860), 48 * K, 48 * K, IdVagasMais, Vagas.Num() < MaxVagas, false, FMath::RoundToInt(24 * K));
	Btn(TEXT("Todos contra todos"), X(520), Y(860), 220 * K, 48 * K, IdPresetTodos, true, false, FMath::RoundToInt(13 * K));
	Btn(TEXT("Em duplas"), X(750), Y(860), 120 * K, 48 * K, IdPresetDuplas, true, false, FMath::RoundToInt(13 * K));
	Btn(TEXT("Você contra todos"), X(880), Y(860), 220 * K, 48 * K, IdPresetUmContraTodos, true, false, FMath::RoundToInt(13 * K));

	// coluna direita: mapa e regras
	Panel(X(1170), Y(130), 710 * K, 800 * K, 0.9f);
	Text(TEXT("Mapa"), X(1196), Y(152), FMath::RoundToInt(24 * K), Ouro);
	Text(TEXT("Tipo"), X(1196), Y(196), FMath::RoundToInt(15 * K), Perg);
	Btn(MapasNome[MapaTipo], X(1196), Y(218), 300 * K, 46 * K, IdMapa, true, false, FMath::RoundToInt(18 * K));
	Text(TEXT("Tamanho"), X(1520), Y(196), FMath::RoundToInt(15 * K), Perg);
	Btn(TamNome[MapaTamanho], X(1520), Y(218), 330 * K, 46 * K, IdTamanho, true, false, FMath::RoundToInt(18 * K));
	Text(FString::Printf(TEXT("Mínimo para %d jogadores: %s"), Abertas, TamNome[TamanhoMinimo(Abertas)]), X(1520), Y(268), FMath::RoundToInt(13 * K), FLinearColor(0.7f, 0.7f, 0.6f));
	Text(TEXT("Semente"), X(1196), Y(300), FMath::RoundToInt(15 * K), Perg);
	Btn(FString::Printf(TEXT("%d  (sortear outra)"), Semente), X(1196), Y(322), 654 * K, 46 * K, IdSemente, true, false, FMath::RoundToInt(18 * K));
	Text(TEXT("O bioma (cores e vegetação) vem do tipo de mapa."), X(1196), Y(374), FMath::RoundToInt(13 * K), FLinearColor(0.7f, 0.7f, 0.6f));

	Text(TEXT("Regras"), X(1196), Y(420), FMath::RoundToInt(24 * K), Ouro);
	Text(TEXT("Era inicial"), X(1196), Y(468), FMath::RoundToInt(15 * K), Perg);
	Btn(EraNome[EraIni], X(1196), Y(490), 300 * K, 46 * K, IdEraIni, true, false, FMath::RoundToInt(18 * K));
	Text(TEXT("Era final"), X(1520), Y(468), FMath::RoundToInt(15 * K), Perg);
	Btn(EraNome[EraFim], X(1520), Y(490), 330 * K, 46 * K, IdEraFim, true, false, FMath::RoundToInt(18 * K));
	Text(TEXT("Vitória"), X(1196), Y(560), FMath::RoundToInt(15 * K), Perg);
	Btn(VitNome[Vitoria], X(1196), Y(582), 654 * K, 46 * K, IdVit, true, false, FMath::RoundToInt(18 * K));
	Text(TEXT("Mapa"), X(1196), Y(652), FMath::RoundToInt(15 * K), Perg);
	Btn(bRevelado ? TEXT("Revelado desde o início") : TEXT("Com névoa de guerra"), X(1196), Y(674), 654 * K, 46 * K, IdRev, true, false, FMath::RoundToInt(18 * K));

	if (!ErroMenu.IsEmpty()) Text(ErroMenu, X(1196), Y(740), FMath::RoundToInt(16 * K), FLinearColor(1.f, 0.5f, 0.4f));
	Btn(TEXT("Voltar"), X(1196), Y(850), 220 * K, 66 * K, IdVoltar, true, false, FMath::RoundToInt(22 * K));
	Btn(TEXT("Começar"), X(1440), Y(850), 410 * K, 66 * K, IdComecar, true, true, FMath::RoundToInt(26 * K));
}
