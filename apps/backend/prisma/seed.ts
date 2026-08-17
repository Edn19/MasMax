import { EpisodePlaybackMode, MovieStatus, PrismaClient, SeriesStatus, VideoSource, VideoType } from '@prisma/client';

const prisma = new PrismaClient();

const image = (seed: string, width = 900, height = 1200) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;

async function main() {
  if (process.env.SEED_DEMO !== 'true') {
    console.log('Contenido demo omitido porque SEED_DEMO no es true.');
    return;
  }

  await prisma.siteSetting.upsert({
    where: { id: 'default-site-setting' },
    update: {},
    create: {
      id: 'default-site-setting',
      siteName: process.env.SITE_NAME ?? 'NovaStream',
      primaryColor: '#22d3ee',
      logo: '',
      youtube: 'https://youtube.com/@novastream-demo',
    },
  });

  const genres = await Promise.all(
    [
      ['Aventura', 'aventura'],
      ['Fantasia', 'fantasia'],
      ['Ciencia ficcion', 'ciencia-ficcion'],
      ['Misterio', 'misterio'],
      ['Comedia', 'comedia'],
      ['Accion', 'accion'],
    ].map(([name, slug]) =>
      prisma.genre.upsert({
        where: { slug },
        update: { name },
        create: { name, slug },
      }),
    ),
  );

  const demoSeries = [
    {
      title: 'Cronicas de Lumen',
      slug: 'cronicas-de-lumen',
      status: SeriesStatus.AIRING,
      year: 2026,
      featured: true,
      description:
        'Una archivista descubre ciudades flotantes alimentadas por memorias antiguas y decide protegerlas de una orden que quiere apagarlas.',
      genreSlugs: ['fantasia', 'aventura'],
    },
    {
      title: 'Orbita Cero',
      slug: 'orbita-cero',
      status: SeriesStatus.FINISHED,
      year: 2025,
      featured: true,
      description:
        'Tripulantes de una estacion minera improvisan una alianza cuando el planeta que vigilan empieza a responder sus pensamientos.',
      genreSlugs: ['ciencia-ficcion', 'misterio'],
    },
    {
      title: 'El Taller del Alba',
      slug: 'el-taller-del-alba',
      status: SeriesStatus.PAUSED,
      year: 2024,
      featured: false,
      description:
        'Aprendices de inventores compiten por reparar maquinas imposibles en una ciudad donde cada amanecer cambia las reglas.',
      genreSlugs: ['comedia', 'aventura'],
    },
    {
      title: 'Distrito Prisma',
      slug: 'distrito-prisma',
      status: SeriesStatus.AIRING,
      year: 2026,
      featured: true,
      description:
        'Una patrulla urbana investiga portales de colores que conectan barrios con versiones alternativas de la misma noche.',
      genreSlugs: ['accion', 'misterio'],
    },
  ];

  for (const item of demoSeries) {
    const { genreSlugs, ...seriesData } = item;
    const seriesGenres = genres.filter((genre) => item.genreSlugs.includes(genre.slug));
    const series = await prisma.series.upsert({
      where: { slug: item.slug },
      update: {
        ...seriesData,
        cover: image(`${item.slug}-cover`),
        banner: image(`${item.slug}-banner`, 1600, 700),
        genres: { set: seriesGenres.map((genre) => ({ id: genre.id })) },
      },
      create: {
        ...seriesData,
        cover: image(`${item.slug}-cover`),
        banner: image(`${item.slug}-banner`, 1600, 700),
        genres: { connect: seriesGenres.map((genre) => ({ id: genre.id })) },
      },
    });

    const season = await prisma.season.upsert({
      where: { seriesId_number: { seriesId: series.id, number: 1 } },
      update: { title: 'Temporada 1', published: true, deletedAt: null },
      create: { seriesId: series.id, number: 1, title: 'Temporada 1', published: true },
    });

    for (let episodeNumber = 1; episodeNumber <= 4; episodeNumber += 1) {
      await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: episodeNumber } },
        update: {},
        create: {
          seriesId: series.id,
          seasonId: season.id,
          number: episodeNumber,
          position: episodeNumber,
          title: `Episodio ${episodeNumber}: Senal ${episodeNumber}`,
          description: `Una entrega demo original de ${item.title}, creada para probar catalogo, reproductor y comentarios.`,
          videoType: episodeNumber % 2 === 0 ? VideoType.HLS : VideoType.MP4,
          videoUrl:
            episodeNumber % 2 === 0
              ? 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
              : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          originalVideoUrl:
            episodeNumber % 2 === 0
              ? 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
              : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          processedVideoUrl:
            episodeNumber % 2 === 0
              ? 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
              : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          playbackMode: episodeNumber % 2 === 0 ? EpisodePlaybackMode.HLS : EpisodePlaybackMode.ORIGINAL,
          videoSource: episodeNumber % 2 === 0 ? VideoSource.HLS : VideoSource.URL,
          thumbnailUrl: image(`${item.slug}-episode-${episodeNumber}`, 800, 450),
          published: true,
          publishedAt: new Date(Date.now() - episodeNumber * 86400000),
        },
      });
    }
  }

  const demoMovies = [
    {
      title: 'El Faro de Titan',
      slug: 'el-faro-de-titan',
      description: 'Una navegante solitaria sigue una senal imposible hasta un faro que flota sobre las nubes de Titan.',
      duration: 104,
      releaseYear: 2026,
      genreSlugs: ['ciencia-ficcion', 'aventura'],
    },
    {
      title: 'Jardin de Medianoche',
      slug: 'jardin-de-medianoche',
      description: 'Dos guardianes descubren que las plantas de un jardin secreto almacenan recuerdos de toda la ciudad.',
      duration: 96,
      releaseYear: 2025,
      genreSlugs: ['fantasia', 'misterio'],
    },
    {
      title: 'Ruta Cometa',
      slug: 'ruta-cometa',
      description: 'Una mensajera espacial acepta entregar un paquete que cambia de destino cada vez que lo observa.',
      duration: 111,
      releaseYear: 2026,
      genreSlugs: ['accion', 'comedia'],
    },
  ];

  for (const item of demoMovies) {
    const movieGenres = genres.filter((genre) => item.genreSlugs.includes(genre.slug));
    await prisma.movie.upsert({
      where: { slug: item.slug },
      update: {
        title: item.title,
        description: item.description,
        posterUrl: image(`${item.slug}-poster`),
        bannerUrl: image(`${item.slug}-banner`, 1600, 700),
        duration: item.duration,
        releaseYear: item.releaseYear,
        status: MovieStatus.PUBLISHED,
        genres: { set: movieGenres.map((genre) => ({ id: genre.id })) },
      },
      create: {
        title: item.title,
        slug: item.slug,
        description: item.description,
        posterUrl: image(`${item.slug}-poster`),
        bannerUrl: image(`${item.slug}-banner`, 1600, 700),
        duration: item.duration,
        releaseYear: item.releaseYear,
        status: MovieStatus.PUBLISHED,
        videoSource: VideoSource.URL,
        videoType: VideoType.MP4,
        videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        originalVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        processedVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        genres: { connect: movieGenres.map((genre) => ({ id: genre.id })) },
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
