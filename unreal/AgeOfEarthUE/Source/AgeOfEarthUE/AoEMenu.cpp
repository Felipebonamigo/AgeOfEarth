// U4: menu principal e "Criar partida" no Canvas. Visual: vidro escuro e linhas finas de ouro (sem molduras pesadas), retratos dos
// deuses e icones das Eras do proprio jogo, cores de jogador e de equipe visiveis, cartoes de mapa tingidos pelo bioma.
// A configuracao vai pela ponte oficial ({"type":"novaPartida","setup":{...}}, scripts/unreal/match.ts).
#include "AoEHud.h"
#include "AoEBridgeActor.h"
#include "CanvasItem.h"
#include "RenderResource.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

namespace
{
	const TCHAR* const Deuses[] = { TEXT("zeus"), TEXT("poseidon"), TEXT("hades") };
	const TCHAR* const DeusesNome[] = { TEXT("Zeus"), TEXT("Poseidon"), TEXT("Hades") };
	const TCHAR* const Difs[] = { TEXT("facil"), TEXT("normal"), TEXT("dificil"), TEXT("muito_dificil") };
	const TCHAR* const DifsNome[] = { TEXT("Fácil"), TEXT("Normal"), TEXT("Difícil"), TEXT("Brutal") };
	const TCHAR* const MapasId[] = { TEXT("continental"), TEXT("mountains"), TEXT("forest"), TEXT("desert"), TEXT("lakes"), TEXT("coastal"), TEXT("islands"), TEXT("mediterranean") };
	const TCHAR* const MapasNome[] = { TEXT("Continental"), TEXT("Montanhas"), TEXT("Floresta"), TEXT("Deserto"), TEXT("Lagos"), TEXT("Costeiro"), TEXT("Ilhas"), TEXT("Mediterrâneo") };
	// tinta de cada tipo de mapa (cima, baixo): o bioma que o jogador vai ver
	const FLinearColor MapasCor[8][2] = {
		{ FLinearColor(0.30f, 0.42f, 0.20f), FLinearColor(0.14f, 0.22f, 0.10f) }, { FLinearColor(0.42f, 0.40f, 0.38f), FLinearColor(0.16f, 0.15f, 0.15f) },
		{ FLinearColor(0.12f, 0.30f, 0.14f), FLinearColor(0.05f, 0.14f, 0.07f) }, { FLinearColor(0.70f, 0.55f, 0.28f), FLinearColor(0.34f, 0.24f, 0.10f) },
		{ FLinearColor(0.22f, 0.45f, 0.50f), FLinearColor(0.08f, 0.20f, 0.26f) }, { FLinearColor(0.35f, 0.55f, 0.55f), FLinearColor(0.50f, 0.42f, 0.26f) },
		{ FLinearColor(0.12f, 0.40f, 0.62f), FLinearColor(0.05f, 0.18f, 0.34f) }, { FLinearColor(0.18f, 0.50f, 0.68f), FLinearColor(0.30f, 0.40f, 0.22f) } };
	const TCHAR* const TamId[] = { TEXT("small"), TEXT("medium"), TEXT("large"), TEXT("huge"), TEXT("giant") };
	const TCHAR* const TamNome[] = { TEXT("Pequeno"), TEXT("Médio"), TEXT("Grande"), TEXT("Enorme"), TEXT("Gigante") };
	const TCHAR* const VitId[] = { TEXT("conquista"), TEXT("maravilhas"), TEXT("posse") };
	const TCHAR* const VitNome[] = { TEXT("Conquista"), TEXT("Maravilhas"), TEXT("Posse") };
	const TCHAR* const EraNome[] = { TEXT("Arcaica"), TEXT("Clássica"), TEXT("Helenística"), TEXT("Bizantina"), TEXT("da Pólvora"), TEXT("Industrial"), TEXT("Moderna"), TEXT("dos Titãs") };
	const TCHAR* const BiomaId[] = { TEXT(""), TEXT("atica"), TEXT("egeu"), TEXT("montanha"), TEXT("deserto"), TEXT("submundo") };
	const TCHAR* const BiomaNome[] = { TEXT("Automático"), TEXT("Ática"), TEXT("Egeu"), TEXT("Montanha"), TEXT("Deserto"), TEXT("Submundo") };
	// as 12 cores da simulacao (PLAYER_COLORS), na ordem dos lugares abertos
	const uint32 Cores[12] = { 0x3b82f6, 0xef4444, 0x22c55e, 0xeab308, 0xf97316, 0x6d28d9, 0x22d3ee, 0xf472b6, 0xf1f5f9, 0x92400e, 0xbef264, 0x475569 };
	FLinearColor Cor(int32 I) { const uint32 V = Cores[FMath::Clamp(I, 0, 11)]; return FLinearColor::FromSRGBColor(FColor((V >> 16) & 0xFF, (V >> 8) & 0xFF, V & 0xFF)); }
	constexpr int32 MaxVagas = 12;
	// ids dos botoes
	enum : int32 { IdJogar = 1, IdSair = 2, IdVagasMenos = 20, IdVagasMais = 21, IdSemente = 32, IdRev = 43, IdPresetTodos = 50, IdPresetDuplas = 51, IdPresetUmContraTodos = 52,
		IdComecar = 90, IdVoltar = 91, IdTipo = 100, IdDeus = 200, IdEquipe = 300, IdDif = 400, IdEra = 500, IdMapa = 600, IdTam = 700, IdVit = 800, IdBioma = 900 };
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
	int32 Bi = 0; if (FParse::Value(FCommandLine::Get(), TEXT("AoEMenuBioma="), Bi)) BiomaSel = FMath::Clamp(Bi, 0, 5);
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEMenuJogar"))) { Tela = ETela::Criar; bAutoJogar = true; }
}

int32 AAoEHud::AbertasCount() const { int32 N = 0; for (const FVaga& V : Vagas) if (V.Tipo != 2) ++N; return N; }

int32 AAoEHud::TamanhoMinimo(int32 Abertas) const
{
	// mesma tabela de scripts/unreal/match.ts (MIN_SIZE_FOR_PLAYERS): <=4 pequeno, <=6 medio, <=8 grande, <=10 enorme, <=12 gigante
	return Abertas <= 4 ? 0 : Abertas <= 6 ? 1 : Abertas <= 8 ? 2 : Abertas <= 10 ? 3 : 4;
}

bool AAoEHud::Btn(const FString&, float, float, float, float, int32, bool, bool, int32) { return false; }   // antigo botao de moldura; o menu novo desenha por conta propria

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
	if (Id >= IdBioma) { BiomaSel = (BiomaSel + 1) % 6; return; }
	if (Id >= IdVit) { Vitoria = FMath::Clamp(Id - IdVit, 0, 2); return; }
	if (Id >= IdTam) { MapaTamanho = FMath::Clamp(Id - IdTam, TamanhoMinimo(AbertasCount()), 4); return; }
	if (Id >= IdMapa) { MapaTipo = FMath::Clamp(Id - IdMapa, 0, 7); return; }
	if (Id >= IdEra)
	{
		// clique numa Era: leva a ponta mais proxima (fora do intervalo, a ponta daquele lado)
		const int32 E = FMath::Clamp(Id - IdEra, 0, 7);
		if (E < EraIni) EraIni = E; else if (E > EraFim) EraFim = E; else if (E - EraIni <= EraFim - E) EraIni = E; else EraFim = E;
		return;
	}
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
	case IdVagasMais: if (Vagas.Num() < MaxVagas) { FVaga V; V.Tipo = 1; V.Deus = Vagas.Num() % 3; V.Equipe = Vagas.Num() + 1; Vagas.Add(V); MapaTamanho = FMath::Max(MapaTamanho, TamanhoMinimo(AbertasCount())); } break;
	case IdVagasMenos: if (Vagas.Num() > 2) Vagas.Pop(); break;
	case IdSemente: Semente = (Semente * 1103515245 + 12345) & 0x7fffffff; break;
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
	B->bBiomaMenuForca = BiomaSel > 0;
	B->BiomaMenu = BiomaSel > 0 ? BiomaId[BiomaSel] : MapaTipo == 3 ? TEXT("deserto") : TEXT("");   // automatico: tipo desert = bioma deserto (Egito)
	SerieAoEnviar = B->TerrenoSerial;
	TCarregando = 0.f;
	B->SendRaw(FString::Printf(TEXT("{\"type\":\"novaPartida\",\"setup\":%s}"), *Setup));
	B->SendRaw(TEXT("{\"type\":\"pause\",\"paused\":false}"));
	Tela = ETela::Carregando;
	UE_LOG(LogTemp, Log, TEXT("AoE: menu enviou novaPartida: %s"), *Setup);
}

void AAoEHud::DrawMenu()
{
	// teste do caminho do clique (-AoEMenuTeste): aperta Jogar e depois Comecar pelo mesmo MenuClick do mouse, no centro do botao desenhado
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEMenuTeste")) && Tela != ETela::Carregando)
	{
		static float TT = 0.f; static float Ult = 0.f; TT += 0.016f;
		const int32 Alvo = Tela == ETela::Principal ? IdJogar : IdComecar;
		if (TT > 8.f && TT - Ult > 3.f && FindBridge() && FindBridge()->bHaveState && FindBridge()->PonteConectada())
			for (const FHit& H : Hits) if (H.Id == Alvo) { Ult = TT; const FVector2D C = (H.R.Min + H.R.Max) * 0.5; UE_LOG(LogTemp, Log, TEXT("AoE: teste do menu clica em %d (%.0f, %.0f)"), Alvo, C.X, C.Y); MenuClick((float)C.X, (float)C.Y); break; }
	}
	Hits.Reset();
	const float Sx = Canvas->SizeX, Sy = Canvas->SizeY;
	const float K = FMath::Clamp(FMath::Min(Sx / 1920.f, Sy / 1080.f), 0.6f, 2.f);
	const float Ox = (Sx - 1920.f * K) * 0.5f, Oy = (Sy - 1080.f * K) * 0.5f;
	float MX = -1.f, MY = -1.f;
	if (PlayerOwner) PlayerOwner->GetMousePosition(MX, MY);
	AAoEBridgeActor* B = FindBridge();

	const FLinearColor Ouro(0.88f, 0.70f, 0.30f), OuroBr(1.f, 0.84f, 0.45f), Marfim(0.95f, 0.92f, 0.82f), Mudo(0.66f, 0.62f, 0.52f);
	const FLinearColor Vidro(0.045f, 0.040f, 0.035f, 0.78f), VidroSel(0.10f, 0.085f, 0.06f, 0.88f);
	auto X = [&](float V) { return Ox + V * K; };
	auto Y = [&](float V) { return Oy + V * K; };
	auto Fs = [&](float V) { return FMath::Max(8, FMath::RoundToInt(V * K)); };
	auto Rect = [&](float x, float y, float w, float h, const FLinearColor& C, bool bAbs = false)
	{
		FCanvasTileItem T(bAbs ? FVector2D(x, y) : FVector2D(X(x), Y(y)), bAbs ? FVector2D(w, h) : FVector2D(w * K, h * K), C);
		T.BlendMode = SE_BLEND_Translucent; Canvas->DrawItem(T);
	};
	auto Borda = [&](float x, float y, float w, float h, const FLinearColor& C, float e = 1.f)
	{ Rect(x, y, w, e, C); Rect(x, y + h - e, w, e, C); Rect(x, y, e, h, C); Rect(x + w - e, y, e, h, C); };
	auto Degrade = [&](float x, float y, float w, float h, const FLinearColor& A, const FLinearColor& Bc)
	{ const int32 N = 14; for (int32 i = 0; i < N; ++i) { const float Y0 = FMath::RoundToFloat(Y(y + h * i / N)), Y1 = FMath::RoundToFloat(Y(y + h * (i + 1) / N)); Rect(X(x), Y0, w * K, Y1 - Y0, FMath::Lerp(A, Bc, (float)i / (N - 1)), true); } };
	auto Over = [&](float x, float y, float w, float h) { return MX >= X(x) && MX <= X(x + w) && MY >= Y(y) && MY <= Y(y + h); };
	auto Hit = [&](float x, float y, float w, float h, int32 Id)
	{
		FHit Ht; Ht.R = FBox2D(FVector2D(X(x), Y(y)), FVector2D(X(x + w), Y(y + h))); Ht.Id = Id; Hits.Add(Ht);
		return Over(x, y, w, h);
	};
	// texto centrado numa caixa; Tam em unidades virtuais
	auto TextoCx = [&](const FString& S, float x, float y, float w, float h, float Tam, const FLinearColor& C, bool bBold = true)
	{
		const FVector2D M = Measure(S, Fs(Tam), bBold);
		Text(S, X(x) + (w * K - (float)M.X) * 0.5f, Y(y) + (h * K - (float)M.Y) * 0.5f, Fs(Tam), C, bBold, false);
	};
	auto TextoEsq = [&](const FString& S, float x, float y, float h, float Tam, const FLinearColor& C, bool bBold = true)
	{
		const FVector2D M = Measure(S, Fs(Tam), bBold);
		Text(S, X(x), Y(y) + (h * K - (float)M.Y) * 0.5f, Fs(Tam), C, bBold, false);
	};
	// texto com espacamento entre letras (rotulos e titulos)
	auto Trilha = [&](const FString& S, float x, float y, float Tam, const FLinearColor& C, float Esp, bool bBold = true, bool bSombra = false)
	{
		float Cx = X(x);
		for (int32 i = 0; i < S.Len(); ++i)
		{
			const FString Ch = S.Mid(i, 1);
			Text(Ch, Cx, Y(y), Fs(Tam), C, bBold, bSombra);
			Cx += (float)Measure(Ch, Fs(Tam), bBold).X + Esp * K;
		}
		return (Cx - X(x)) / K;
	};
	auto Losango = [&](float cx, float cy, float r, const FLinearColor& C)
	{
		FCanvasTriangleItem T1(FVector2D(X(cx), Y(cy - r)), FVector2D(X(cx + r), Y(cy)), FVector2D(X(cx), Y(cy + r)), GWhiteTexture); T1.SetColor(C);
		FCanvasTriangleItem T2(FVector2D(X(cx), Y(cy - r)), FVector2D(X(cx - r), Y(cy)), FVector2D(X(cx), Y(cy + r)), GWhiteTexture); T2.SetColor(C);
		T1.BlendMode = SE_BLEND_Translucent; T2.BlendMode = SE_BLEND_Translucent; Canvas->DrawItem(T1); Canvas->DrawItem(T2);
	};
	// filete dourado fino com um losango no meio (a "grega" do jogo, em versao leve)
	auto Filete = [&](float x, float y, float w)
	{
		Rect(x, y, w * 0.5f - 14.f, 1.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.7f)); Rect(x + w * 0.5f + 14.f, y, w * 0.5f - 14.f, 1.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.7f));
		Losango(x + w * 0.5f, y + 0.5f, 6.f, Ouro);
	};
	// fundo: escurece a cena do jogo, mais forte nas bordas
	Rect(0, 0, Sx, Sy, FLinearColor(0.02f, 0.016f, 0.012f, Tela == ETela::Carregando ? 0.55f : Tela == ETela::Principal ? 0.38f : 0.72f), true);
	{
		const int32 N = 24;
		for (int32 i = 0; i < N; ++i)
		{
			const float A = 0.5f * FMath::Square(1.f - (float)i / N);
			const float T0 = FMath::RoundToFloat(Sy * 0.35f * i / N), T1 = FMath::RoundToFloat(Sy * 0.35f * (i + 1) / N);   // bordas inteiras: sem frestas entre as faixas
			Rect(0, T0, Sx, T1 - T0, FLinearColor(0.f, 0.f, 0.f, A * 0.8f), true);                    // topo
			Rect(0, Sy - T1, Sx, T1 - T0, FLinearColor(0.f, 0.f, 0.f, A), true);                      // base
		}
		if (Tela == ETela::Principal) for (int32 i = 0; i < N; ++i) { const float L0 = FMath::RoundToFloat(Sx * 0.7f * i / N), L1 = FMath::RoundToFloat(Sx * 0.7f * (i + 1) / N); Rect(L0, 0, L1 - L0, Sy, FLinearColor(0.01f, 0.008f, 0.006f, 0.62f * FMath::Square(1.f - (float)i / N)), true); }   // lado do texto
	}

	// ======================= Menu principal =======================
	if (Tela == ETela::Principal)
	{
		Trilha(TEXT("AGE OF"), 150.f, 150.f, 54.f, Marfim, 14.f, true, true);
		Trilha(TEXT("EARTH"), 146.f, 205.f, 128.f, OuroBr, 10.f, true, true);
		Filete(150.f, 394.f, 520.f);
		TextoEsq(TEXT("O mundo antigo à espera de um general"), 150.f, 408.f, 36.f, 20.f, Mudo, false);
		struct FItem { const TCHAR* Nome; int32 Id; };
		const FItem Itens[] = { { TEXT("JOGAR"), IdJogar }, { TEXT("CAMPANHA"), 0 }, { TEXT("EDITOR DE MAPAS"), 0 }, { TEXT("OPÇÕES"), 0 }, { TEXT("SAIR"), IdSair } };
		float Iy = 520.f;
		for (const FItem& It : Itens)
		{
			const bool bAtivo = It.Id != 0;
			const bool bSobre = bAtivo ? Hit(150.f, Iy, 520.f, 64.f, It.Id) : Over(150.f, Iy, 520.f, 64.f);
			if (bAtivo && bSobre) { Rect(150.f, Iy, 520.f, 64.f, FLinearColor(0.88f, 0.70f, 0.30f, 0.10f)); Rect(150.f, Iy + 6.f, 4.f, 52.f, OuroBr); }
			const FLinearColor C = !bAtivo ? FLinearColor(0.45f, 0.42f, 0.36f) : bSobre ? OuroBr : Marfim;
			const float Dx = bAtivo && bSobre ? 16.f : 0.f;
			Trilha(It.Nome, 176.f + Dx, Iy + 12.f, 34.f, C, 5.f, true, bAtivo);
			if (!bAtivo) TextoEsq(TEXT("em breve"), 720.f, Iy, 64.f, 15.f, FLinearColor(0.45f, 0.42f, 0.36f), false);
			Iy += 74.f;
		}
		// os três deuses do jogo, discretos no canto: é com eles que se joga
		float Gx = 1560.f;
		for (int32 i = 0; i < 3; ++i)
		{
			Icon(FString::Printf(TEXT("god/%s"), Deuses[i]), X(Gx), Y(900.f), 84.f * K, FLinearColor(1.f, 1.f, 1.f, 0.85f));
			Borda(Gx, 900.f, 84.f, 84.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.55f));
			Gx += 104.f;
		}
		TextoEsq(TEXT("Zeus  ·  Poseidon  ·  Hades"), 1560.f, 990.f, 24.f, 15.f, Mudo, false);
		TextoEsq(TEXT("pré-alpha"), 150.f, 1020.f, 24.f, 14.f, FLinearColor(0.5f, 0.46f, 0.38f), false);
		return;
	}

	// ======================= Carregando =======================
	if (Tela == ETela::Carregando)
	{
		TCarregando += 0.016f;
		TextoCx(TEXT("PREPARANDO A PARTIDA"), 0.f, 430.f, 1920.f, 70.f, 52.f, Marfim);
		Filete(660.f, 520.f, 600.f);
		TextoCx(ErroMenu.IsEmpty() ? FString::Printf(TEXT("Gerando o mundo  ·  %s  ·  %s"), MapasNome[MapaTipo], TamNome[MapaTamanho]) : ErroMenu, 0.f, 540.f, 1920.f, 40.f, 20.f, Mudo, false);
		const float Pos = FMath::Frac(TCarregando * 0.55f);
		Rect(660.f, 610.f, 600.f, 2.f, FLinearColor(1.f, 1.f, 1.f, 0.10f));
		const float Ini = 660.f + 600.f * FMath::Max(0.f, Pos - 0.25f) / 1.f, Fim = 660.f + 600.f * FMath::Min(1.f, Pos + 0.0f);
		Rect(Ini, 609.f, FMath::Max(0.f, Fim - Ini), 4.f, OuroBr);
		if (B && B->TerrenoSerial != SerieAoEnviar && TCarregando > 0.8f) bMenu = false;   // a nova partida chegou
		else if (B && !B->UltimoErro.IsEmpty()) { ErroMenu = B->UltimoErro; B->UltimoErro.Reset(); Tela = ETela::Criar; }
		else if (TCarregando > 90.f) { ErroMenu = TEXT("A simulação não respondeu em 90 s."); Tela = ETela::Criar; }
		return;
	}

	// ======================= Criar partida =======================
	if (bAutoJogar && B && B->bHaveState && B->PonteConectada()) { bAutoJogar = false; EnviarPartida(); return; }
	const int32 Abertas = AbertasCount();
	Trilha(TEXT("CRIAR PARTIDA"), 60.f, 38.f, 46.f, Marfim, 8.f, true, true);
	Filete(60.f, 104.f, 380.f);
	{	// voltar
		const bool S = Hit(1700.f, 46.f, 160.f, 44.f, IdVoltar);
		Rect(1700.f, 46.f, 160.f, 44.f, S ? FLinearColor(1.f, 1.f, 1.f, 0.10f) : FLinearColor(0.f, 0.f, 0.f, 0.35f)); Borda(1700.f, 46.f, 160.f, 44.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, S ? 0.9f : 0.4f));
		TextoCx(TEXT("‹  VOLTAR"), 1700.f, 46.f, 160.f, 44.f, 17.f, S ? OuroBr : Marfim);
	}

	// ---- jogadores ----
	Trilha(TEXT("JOGADORES"), 60.f, 132.f, 18.f, Ouro, 4.f);
	TextoEsq(FString::Printf(TEXT("%d  de  %d"), Abertas, Vagas.Num()), 340.f, 128.f, 28.f, 15.f, Mudo, false);
	Trilha(TEXT("LUGAR"), 90.f, 176.f, 12.f, Mudo, 3.f, false); Trilha(TEXT("DEUS"), 330.f, 176.f, 12.f, Mudo, 3.f, false);
	Trilha(TEXT("EQUIPE"), 600.f, 176.f, 12.f, Mudo, 3.f, false); Trilha(TEXT("DIFICULDADE"), 760.f, 176.f, 12.f, Mudo, 3.f, false);
	const float Lh = 50.f, Lp = 56.f, Ly0 = 198.f, Lx = 60.f, Lw = 1030.f;
	int32 CorIdx = 0;
	for (int32 i = 0; i < Vagas.Num(); ++i)
	{
		const FVaga& V = Vagas[i];
		const float Ly = Ly0 + i * Lp;
		const bool bFechada = V.Tipo == 2;
		Rect(Lx, Ly, Lw, Lh, bFechada ? FLinearColor(0.03f, 0.03f, 0.03f, 0.55f) : Vidro);
		const FLinearColor Cj = bFechada ? FLinearColor(0.25f, 0.25f, 0.25f) : Cor(CorIdx++);
		Rect(Lx, Ly, 6.f, Lh, Cj);
		// lugar
		const bool bTroca = i > 0 && Hit(Lx + 20.f, Ly, 230.f, Lh, IdTipo + i);
		if (bTroca) Rect(Lx + 20.f, Ly + 4.f, 230.f, Lh - 8.f, FLinearColor(1.f, 1.f, 1.f, 0.07f));
		TextoEsq(V.Tipo == 0 ? TEXT("VOCÊ") : V.Tipo == 1 ? FString::Printf(TEXT("BOT  %d"), i + 1) : FString(TEXT("FECHADA")), Lx + 34.f, Ly, Lh, 19.f, bFechada ? Mudo : Marfim);
		if (i > 0) TextoEsq(bFechada ? TEXT("abrir") : TEXT("fechar"), Lx + 170.f, Ly, Lh, 12.f, bTroca ? OuroBr : FLinearColor(0.5f, 0.46f, 0.38f), false);
		if (bFechada) continue;
		// deus
		const bool bDeus = Hit(Lx + 260.f, Ly, 250.f, Lh, IdDeus + i);
		if (bDeus) Rect(Lx + 260.f, Ly + 4.f, 250.f, Lh - 8.f, FLinearColor(1.f, 1.f, 1.f, 0.07f));
		Icon(FString::Printf(TEXT("god/%s"), Deuses[V.Deus]), X(Lx + 270.f), Y(Ly + 4.f), 42.f * K);
		Borda(Lx + 270.f, Ly + 4.f, 42.f, 42.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, bDeus ? 0.95f : 0.45f));
		TextoEsq(DeusesNome[V.Deus], Lx + 326.f, Ly, Lh, 19.f, bDeus ? OuroBr : Marfim);
		// equipe: a mesma cor = o mesmo time
		const bool bEq = Hit(Lx + 530.f, Ly, 110.f, Lh, IdEquipe + i);
		const FLinearColor Ce = Cor(V.Equipe - 1);
		Rect(Lx + 540.f, Ly + 7.f, 46.f, 36.f, FLinearColor(Ce.R * 0.55f, Ce.G * 0.55f, Ce.B * 0.55f, 0.95f)); Borda(Lx + 540.f, Ly + 7.f, 46.f, 36.f, bEq ? OuroBr : FLinearColor(Ce.R, Ce.G, Ce.B, 0.9f));
		TextoCx(FString::FromInt(V.Equipe), Lx + 540.f, Ly + 7.f, 46.f, 36.f, 20.f, FLinearColor::White);
		// dificuldade (so bot)
		if (V.Tipo == 1)
		{
			const bool bDf = Hit(Lx + 680.f, Ly, 330.f, Lh, IdDif + i);
			if (bDf) Rect(Lx + 680.f, Ly + 4.f, 330.f, Lh - 8.f, FLinearColor(1.f, 1.f, 1.f, 0.07f));
			for (int32 p = 0; p < 4; ++p) Rect(Lx + 696.f + p * 16.f, Ly + 36.f - (8.f + p * 5.f), 11.f, 8.f + p * 5.f, p <= V.Dif ? (bDf ? OuroBr : Ouro) : FLinearColor(1.f, 1.f, 1.f, 0.14f));
			TextoEsq(DifsNome[V.Dif], Lx + 776.f, Ly, Lh, 17.f, bDf ? OuroBr : Marfim, false);
		}
		else TextoEsq(TEXT("—"), Lx + 696.f, Ly, Lh, 17.f, Mudo, false);
	}
	// rodape da coluna: lugares e atalhos de equipe
	{
		const float By = 880.f;
		const bool Sm = Hit(Lx, By, 44.f, 44.f, IdVagasMenos), Sp = Hit(Lx + 240.f, By, 44.f, 44.f, IdVagasMais);
		for (int32 k = 0; k < 2; ++k)
		{
			const float Bx = Lx + k * 240.f; const bool S = k ? Sp : Sm;
			Rect(Bx, By, 44.f, 44.f, S ? FLinearColor(1.f, 1.f, 1.f, 0.12f) : Vidro); Borda(Bx, By, 44.f, 44.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, S ? 0.9f : 0.4f));
			TextoCx(k ? TEXT("+") : TEXT("–"), Bx, By, 44.f, 44.f, 24.f, S ? OuroBr : Marfim);
		}
		TextoCx(FString::Printf(TEXT("%d LUGARES"), Vagas.Num()), Lx + 44.f, By, 196.f, 44.f, 16.f, Marfim);
		struct FPre { const TCHAR* Nome; int32 Id; float W; };
		const FPre Pre[] = { { TEXT("TODOS CONTRA TODOS"), IdPresetTodos, 250.f }, { TEXT("DUPLAS"), IdPresetDuplas, 130.f }, { TEXT("VOCÊ CONTRA TODOS"), IdPresetUmContraTodos, 250.f } };
		float Px = Lx + 330.f;
		for (const FPre& P : Pre)
		{
			const bool S = Hit(Px, By, P.W, 44.f, P.Id);
			Rect(Px, By, P.W, 44.f, S ? FLinearColor(1.f, 1.f, 1.f, 0.12f) : FLinearColor(0.f, 0.f, 0.f, 0.35f)); Borda(Px, By, P.W, 44.f, FLinearColor(1.f, 1.f, 1.f, S ? 0.45f : 0.18f));
			TextoCx(P.Nome, Px, By, P.W, 44.f, 13.f, S ? OuroBr : Mudo);
			Px += P.W + 10.f;
		}
	}

	// ---- mapa ----
	const float Rx = 1130.f;
	Trilha(TEXT("MAPA"), Rx, 132.f, 18.f, Ouro, 4.f);
	for (int32 i = 0; i < 8; ++i)
	{
		const float Tx = Rx + (i % 4) * 184.f, Ty = 170.f + (i / 4) * 116.f;
		const bool bSel = i == MapaTipo, S = Hit(Tx, Ty, 172.f, 104.f, IdMapa + i);
		Degrade(Tx, Ty, 172.f, 104.f, MapasCor[i][0], MapasCor[i][1]);
		Rect(Tx, Ty + 48.f, 172.f, 56.f, FLinearColor(0.f, 0.f, 0.f, 0.55f));   // faixa do nome
		if (!bSel && !S) Rect(Tx, Ty, 172.f, 104.f, FLinearColor(0.f, 0.f, 0.f, 0.28f));
		Borda(Tx, Ty, 172.f, 104.f, bSel ? OuroBr : FLinearColor(1.f, 1.f, 1.f, S ? 0.6f : 0.14f), bSel ? 3.f : 1.f);
		{	// motivo do bioma (formas simples, so para dar identidade ao cartao)
			auto Tri = [&](float ax, float ay, float bx, float by, float cx, float cy, const FLinearColor& C)
			{
				FCanvasTriangleItem T(FVector2D(X(Tx + ax), Y(Ty + ay)), FVector2D(X(Tx + bx), Y(Ty + by)), FVector2D(X(Tx + cx), Y(Ty + cy)), GWhiteTexture); T.SetColor(C); T.BlendMode = SE_BLEND_Translucent; Canvas->DrawItem(T);
			};
			const FLinearColor Cl = FLinearColor(1.f, 1.f, 1.f, 0.16f), Es = FLinearColor(0.f, 0.f, 0.f, 0.22f);
			switch (i)
			{
			case 0: Tri(0, 50, 70, 18, 150, 50, Cl); Tri(60, 50, 120, 28, 172, 50, Es); break;
			case 1: Tri(10, 50, 52, 6, 94, 50, FLinearColor(0.75f, 0.75f, 0.78f, 0.30f)); Tri(70, 50, 112, 14, 160, 50, FLinearColor(0.f, 0.f, 0.f, 0.25f)); Tri(40, 20, 52, 6, 64, 20, FLinearColor(1.f, 1.f, 1.f, 0.7f)); break;
			case 2: for (int32 k = 0; k < 8; ++k) { const float a = 8.f + k * 20.f, h = 18.f + (k % 3) * 8.f; Tri(a, 50, a + 10, 50 - h, a + 20, 50, FLinearColor(0.f, 0.12f, 0.04f, 0.55f)); } break;
			case 3: Tri(-10, 50, 60, 24, 130, 50, FLinearColor(1.f, 0.9f, 0.6f, 0.22f)); Tri(70, 50, 130, 30, 190, 50, Es); Losango(Tx + 140.f, Ty + 16.f, 9.f, FLinearColor(1.f, 0.85f, 0.4f, 0.9f)); break;
			case 4: Losango(Tx + 50.f, Ty + 30.f, 22.f, FLinearColor(0.5f, 0.8f, 0.95f, 0.30f)); Losango(Tx + 120.f, Ty + 24.f, 15.f, FLinearColor(0.5f, 0.8f, 0.95f, 0.30f)); break;
			case 5: Tri(0, 50, 172, 50, 172, 14, FLinearColor(0.85f, 0.75f, 0.5f, 0.35f)); break;
			case 6: Losango(Tx + 40.f, Ty + 34.f, 14.f, FLinearColor(0.85f, 0.75f, 0.5f, 0.45f)); Losango(Tx + 100.f, Ty + 22.f, 10.f, FLinearColor(0.85f, 0.75f, 0.5f, 0.45f)); Losango(Tx + 140.f, Ty + 38.f, 17.f, FLinearColor(0.85f, 0.75f, 0.5f, 0.45f)); break;
			default: Tri(0, 50, 0, 10, 70, 50, FLinearColor(0.85f, 0.75f, 0.5f, 0.40f)); Losango(Tx + 130.f, Ty + 28.f, 12.f, FLinearColor(0.85f, 0.75f, 0.5f, 0.40f)); break;
			}
		}
		{
			float Tam = 17.f; const float Larg = (float)Measure(MapasNome[i], Fs(Tam), true).X / K;
			if (Larg > 150.f) Tam *= 150.f / Larg;
			TextoEsq(MapasNome[i], Tx + 12.f, Ty + 62.f, 30.f, Tam, bSel ? OuroBr : Marfim);
		}
		if (bSel) Losango(Tx + 154.f, Ty + 16.f, 7.f, OuroBr);
	}
	// tamanho
	Trilha(TEXT("TAMANHO"), Rx, 420.f, 15.f, Ouro, 4.f);
	const int32 Min = TamanhoMinimo(Abertas);
	for (int32 i = 0; i < 5; ++i)
	{
		const float Tx = Rx + i * 146.f; const bool bSel = i == MapaTamanho, bOk = i >= Min, S = bOk && Hit(Tx, 446.f, 142.f, 46.f, IdTam + i);
		Rect(Tx, 446.f, 142.f, 46.f, bSel ? FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.95f) : S ? FLinearColor(1.f, 1.f, 1.f, 0.14f) : Vidro);
		Borda(Tx, 446.f, 142.f, 46.f, bSel ? OuroBr : FLinearColor(1.f, 1.f, 1.f, bOk ? 0.20f : 0.07f));
		TextoCx(TamNome[i], Tx, 446.f, 142.f, 46.f, 15.f, bSel ? FLinearColor(0.08f, 0.06f, 0.03f) : bOk ? Marfim : FLinearColor(0.38f, 0.36f, 0.32f));
	}
	if (Min > 0) TextoEsq(FString::Printf(TEXT("%d jogadores pedem pelo menos o mapa %s"), Abertas, TamNome[Min]), Rx, 496.f, 24.f, 13.f, Mudo, false);
	// semente e bioma
	Trilha(TEXT("SEMENTE"), Rx, 540.f, 15.f, Ouro, 4.f);
	Trilha(TEXT("BIOMA"), Rx + 376.f, 540.f, 15.f, Ouro, 4.f);
	{
		const bool S = Hit(Rx, 566.f, 350.f, 44.f, IdSemente);
		Rect(Rx, 566.f, 350.f, 44.f, S ? FLinearColor(1.f, 1.f, 1.f, 0.12f) : Vidro); Borda(Rx, 566.f, 350.f, 44.f, FLinearColor(1.f, 1.f, 1.f, S ? 0.45f : 0.18f));
		TextoEsq(FString::FromInt(Semente), Rx + 16.f, 566.f, 44.f, 19.f, Marfim);
		TextoEsq(TEXT("SORTEAR"), Rx + 240.f, 566.f, 44.f, 13.f, S ? OuroBr : Mudo);
		const bool Sb = Hit(Rx + 376.f, 566.f, 350.f, 44.f, IdBioma);
		Rect(Rx + 376.f, 566.f, 350.f, 44.f, Sb ? FLinearColor(1.f, 1.f, 1.f, 0.12f) : Vidro); Borda(Rx + 376.f, 566.f, 350.f, 44.f, FLinearColor(1.f, 1.f, 1.f, Sb ? 0.45f : 0.18f));
		TextoEsq(BiomaNome[BiomaSel], Rx + 392.f, 566.f, 44.f, 19.f, BiomaSel ? OuroBr : Marfim);
		TextoEsq(TEXT("TROCAR"), Rx + 610.f, 566.f, 44.f, 13.f, Sb ? OuroBr : Mudo);
	}
	// eras
	Trilha(TEXT("ERAS"), Rx, 636.f, 15.f, Ouro, 4.f);
	TextoEsq(FString::Printf(TEXT("%s   –   %s"), EraNome[EraIni], EraNome[EraFim]), Rx + 100.f, 632.f, 26.f, 15.f, Marfim, false);
	for (int32 i = 0; i < 8; ++i)
	{
		const float Tx = Rx + i * 91.f; const bool bDentro = i >= EraIni && i <= EraFim, bPonta = i == EraIni || i == EraFim, S = Hit(Tx, 664.f, 84.f, 84.f, IdEra + i);
		Rect(Tx, 664.f, 84.f, 84.f, bDentro ? FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.16f) : Vidro);
		Icon(FString::Printf(TEXT("age/%d"), i), X(Tx + 12.f), Y(676.f), 60.f * K, bDentro ? FLinearColor::White : FLinearColor(1.f, 1.f, 1.f, S ? 0.7f : 0.3f));
		Borda(Tx, 664.f, 84.f, 84.f, bPonta ? OuroBr : bDentro ? FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.55f) : FLinearColor(1.f, 1.f, 1.f, S ? 0.4f : 0.12f), bPonta ? 2.f : 1.f);
	}
	// vitoria
	Trilha(TEXT("VITÓRIA"), Rx, 776.f, 15.f, Ouro, 4.f);
	for (int32 i = 0; i < 3; ++i)
	{
		const float Tx = Rx + i * 244.f; const bool bSel = i == Vitoria, S = Hit(Tx, 802.f, 238.f, 44.f, IdVit + i);
		Rect(Tx, 802.f, 238.f, 44.f, bSel ? FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.95f) : S ? FLinearColor(1.f, 1.f, 1.f, 0.14f) : Vidro);
		Borda(Tx, 802.f, 238.f, 44.f, bSel ? OuroBr : FLinearColor(1.f, 1.f, 1.f, 0.20f));
		TextoCx(VitNome[i], Tx, 802.f, 238.f, 44.f, 15.f, bSel ? FLinearColor(0.08f, 0.06f, 0.03f) : Marfim);
	}
	// mapa revelado
	{
		const bool S = Hit(Rx, 868.f, 726.f, 44.f, IdRev);
		Rect(Rx, 868.f, 726.f, 44.f, S ? FLinearColor(1.f, 1.f, 1.f, 0.08f) : FLinearColor(0.f, 0.f, 0.f, 0.0f));
		TextoEsq(TEXT("MAPA REVELADO DESDE O INÍCIO"), Rx + 4.f, 868.f, 44.f, 15.f, S ? OuroBr : Marfim);
		const float Sx0 = Rx + 726.f - 66.f;
		Rect(Sx0, 880.f, 60.f, 24.f, bRevelado ? FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.9f) : FLinearColor(1.f, 1.f, 1.f, 0.16f));
		Rect(Sx0 + (bRevelado ? 38.f : 2.f), 882.f, 20.f, 20.f, bRevelado ? FLinearColor(0.08f, 0.06f, 0.03f) : Mudo);
	}

	// ---- rodape: resumo e Começar ----
	Rect(0, Y(944.f), Sx, 1.f, FLinearColor(Ouro.R, Ouro.G, Ouro.B, 0.45f), true);
	Rect(0, Y(945.f), Sx, Sy - Y(945.f), FLinearColor(0.f, 0.f, 0.f, 0.55f), true);
	int32 Times = 0; { TSet<int32> T; for (const FVaga& V : Vagas) if (V.Tipo != 2) T.Add(V.Equipe); Times = T.Num(); }
	TextoEsq(FString::Printf(TEXT("%d jogadores  ·  %d %s  ·  %s  ·  %s  ·  %s a %s"), Abertas, Times, Times == 1 ? TEXT("equipe") : TEXT("equipes"), MapasNome[MapaTipo], TamNome[MapaTamanho], EraNome[EraIni], EraNome[EraFim]), 60.f, 960.f, 64.f, 17.f, Mudo, false);
	if (!ErroMenu.IsEmpty()) TextoEsq(ErroMenu, 760.f, 960.f, 64.f, 15.f, FLinearColor(1.f, 0.5f, 0.4f), false);
	{
		const bool S = Hit(1460.f, 954.f, 400.f, 56.f, IdComecar);
		Rect(1460.f, 954.f, 400.f, 56.f, S ? OuroBr : Ouro);
		Borda(1460.f, 954.f, 400.f, 56.f, FLinearColor(1.f, 0.9f, 0.6f, 0.9f));
		const FString Rot = TEXT("COMEÇAR  ›");
		const FVector2D M = Measure(Rot, Fs(24.f), true);
		const float Cx = X(1460.f) + (400.f * K - (float)M.X - 5.f * K * Rot.Len()) * 0.5f;
		float Px = Cx;
		for (int32 i = 0; i < Rot.Len(); ++i) { const FString Ch = Rot.Mid(i, 1); Text(Ch, Px, Y(954.f) + (56.f * K - (float)M.Y) * 0.5f, Fs(24.f), FLinearColor(0.08f, 0.06f, 0.03f), true, false); Px += (float)Measure(Ch, Fs(24.f), true).X + 5.f * K; }
	}
}
