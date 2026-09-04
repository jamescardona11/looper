import { useTranslation } from "@looper/i18n/react";

/**
 * Landing-specific copy assembled from the shared Lingui catalog.
 * Keeping the page vocabulary here prevents each visual section from owning a
 * second, hardcoded language source.
 */
export function useLandingCopy() {
  const { locale, t } = useTranslation();

  return {
    locale,
    common: {
      skip: t("landing.purple.common.skip"),
      sections: t("landing.purple.common.sections"),
      menu: t("landing.purple.common.menu"),
      openMenu: t("landing.purple.common.openMenu"),
      language: t("landing.purple.common.language"),
      english: t("landing.purple.common.english"),
      spanish: t("landing.purple.common.spanish"),
    },
    nav: {
      how: t("landing.purple.nav.how"),
      features: t("landing.purple.nav.features"),
      local: t("landing.purple.nav.local"),
      roadmap: t("landing.purple.nav.roadmap"),
      access: t("landing.purple.nav.access"),
    },
    download: {
      macos: t("landing.purple.download.macos"),
      windows: t("landing.purple.download.windows"),
      desktop: t("landing.purple.download.desktop"),
    },
    hero: {
      eyebrow: t("landing.purple.hero.eyebrow"),
      title: t("landing.purple.hero.title"),
      body: t("landing.purple.hero.body"),
      secondaryCta: t("landing.purple.hero.secondaryCta"),
      imageAlt: t("landing.purple.hero.imageAlt"),
      caption: t("landing.purple.hero.caption"),
    },
    platform: {
      label: t("landing.purple.platform.label"),
      title: t("landing.purple.platform.title"),
      mobile: t("landing.purple.platform.mobile"),
    },
    story: {
      eyebrow: t("landing.purple.story.eyebrow"),
      title: t("landing.purple.story.title"),
      steps: [
        {
          label: t("landing.purple.story.step1.label"),
          title: t("landing.purple.story.step1.title"),
          body: t("landing.purple.story.step1.body"),
        },
        {
          label: t("landing.purple.story.step2.label"),
          title: t("landing.purple.story.step2.title"),
          body: t("landing.purple.story.step2.body"),
        },
        {
          label: t("landing.purple.story.step3.label"),
          title: t("landing.purple.story.step3.title"),
          body: t("landing.purple.story.step3.body"),
        },
      ],
      ready: t("landing.purple.story.ready"),
      sourceAttached: t("landing.purple.story.sourceAttached"),
      caption: t("landing.purple.story.caption"),
    },
    pill: {
      listeningTitle: t("landing.purple.pill.listeningTitle"),
      listeningDetail: t("landing.purple.pill.listeningDetail"),
      transcribingTitle: t("landing.purple.pill.transcribingTitle"),
      transcribingDetail: t("landing.purple.pill.transcribingDetail"),
      insertedTitle: t("landing.purple.pill.insertedTitle"),
      insertedDetail: t("landing.purple.pill.insertedDetail"),
    },
    speak: {
      title: t("landing.purple.speak.title"),
      body: t("landing.purple.speak.body"),
      eyebrow: t("landing.purple.speak.eyebrow"),
      command: t("landing.purple.speak.command"),
      contexts: [
        {
          surface: t("landing.purple.speak.editor"),
          treatment: t("landing.purple.speak.editorDetail"),
        },
        {
          surface: t("landing.purple.speak.chat"),
          treatment: t("landing.purple.speak.chatDetail"),
        },
        {
          surface: t("landing.purple.speak.message"),
          treatment: t("landing.purple.speak.messageDetail"),
        },
      ],
    },
    meeting: {
      title: t("landing.purple.meeting.title"),
      body: t("landing.purple.meeting.body"),
      imageAlt: t("landing.purple.meeting.imageAlt"),
      caption: t("landing.purple.meeting.caption"),
    },
    source: {
      title: t("landing.purple.source.title"),
      body: t("landing.purple.source.body"),
      principles: [
        {
          term: t("landing.purple.source.finished"),
          detail: t("landing.purple.source.finishedDetail"),
        },
        {
          term: t("landing.purple.source.original"),
          detail: t("landing.purple.source.originalDetail"),
        },
        {
          term: t("landing.purple.source.recovery"),
          detail: t("landing.purple.source.recoveryDetail"),
        },
      ],
    },
    surfaces: {
      title: t("landing.purple.surfaces.title"),
      body: t("landing.purple.surfaces.body"),
      mobileLabel: t("landing.purple.surfaces.mobileLabel"),
      webTitle: t("landing.purple.surfaces.webTitle"),
      webBody: t("landing.purple.surfaces.webBody"),
      webLabel: t("landing.purple.surfaces.webLabel"),
      mobileAlts: [
        t("landing.purple.surfaces.mobileHomeAlt"),
        t("landing.purple.surfaces.mobileMeetingAlt"),
        t("landing.purple.surfaces.mobileLibraryAlt"),
        t("landing.purple.surfaces.mobileStudioAlt"),
      ],
      webAlts: [
        t("landing.purple.surfaces.webHomeAlt"),
        t("landing.purple.surfaces.webMeetingAlt"),
        t("landing.purple.surfaces.webStudioAlt"),
        t("landing.purple.surfaces.webNoteAlt"),
      ],
    },
    features: {
      title: t("landing.purple.features.title"),
      body: t("landing.purple.features.body"),
      clusters: [
        {
          title: t("landing.purple.features.dictation.title"),
          summary: t("landing.purple.features.dictation.summary"),
          points: [
            t("landing.purple.features.dictation.point1"),
            t("landing.purple.features.dictation.point2"),
            t("landing.purple.features.dictation.point3"),
            t("landing.purple.features.dictation.point4"),
          ],
        },
        {
          title: t("landing.purple.features.notes.title"),
          summary: t("landing.purple.features.notes.summary"),
          points: [
            t("landing.purple.features.notes.point1"),
            t("landing.purple.features.notes.point2"),
            t("landing.purple.features.notes.point3"),
            t("landing.purple.features.notes.point4"),
          ],
        },
        {
          title: t("landing.purple.features.words.title"),
          summary: t("landing.purple.features.words.summary"),
          points: [
            t("landing.purple.features.words.point1"),
            t("landing.purple.features.words.point2"),
            t("landing.purple.features.words.point3"),
          ],
        },
        {
          title: t("landing.purple.features.machine.title"),
          summary: t("landing.purple.features.machine.summary"),
          points: [
            t("landing.purple.features.machine.point1"),
            t("landing.purple.features.machine.point2"),
            t("landing.purple.features.machine.point3"),
            t("landing.purple.features.machine.point4"),
          ],
        },
      ],
    },
    local: {
      eyebrow: t("landing.purple.local.eyebrow"),
      title: t("landing.purple.local.title"),
      body: t("landing.purple.local.body"),
      model: t("landing.purple.local.model"),
      ready: t("landing.purple.local.ready"),
      transcription: t("landing.purple.local.transcription"),
      transcriptionDetail: t("landing.purple.local.transcriptionDetail"),
      storage: t("landing.purple.local.storage"),
      storageDetail: t("landing.purple.local.storageDetail"),
    },
    compare: {
      title: t("landing.purple.compare.title"),
      body: t("landing.purple.compare.body"),
      capability: t("landing.purple.compare.capability"),
      caption: (date: string) => t("landing.purple.compare.caption", { date }),
      confirmed: t("landing.purple.compare.confirmed"),
      notOffered: t("landing.purple.compare.notOffered"),
      notAdvertised: t("landing.purple.compare.notAdvertised"),
      plansChange: (date: string) => t("landing.purple.compare.plansChange", { date }),
      compactLegend: (date: string) => t("landing.purple.compare.compactLegend", { date }),
      notes: {
        Temporary: t("landing.purple.compare.note.temporary"),
        AGPLv3: "AGPLv3",
        Coming: t("landing.purple.compare.note.coming"),
        "Self-host": t("landing.purple.compare.note.selfHost"),
      },
      rows: [
        t("landing.purple.compare.row1"),
        t("landing.purple.compare.row2"),
        t("landing.purple.compare.row3"),
        t("landing.purple.compare.row4"),
        t("landing.purple.compare.row5"),
        t("landing.purple.compare.row6"),
        t("landing.purple.compare.row7"),
        t("landing.purple.compare.row8"),
        t("landing.purple.compare.row9"),
        t("landing.purple.compare.row10"),
      ],
    },
    smallPrint: {
      title: t("landing.purple.smallPrint.title"),
      body: t("landing.purple.smallPrint.body"),
      cards: [
        {
          heading: t("landing.purple.smallPrint.card1.title"),
          body: t("landing.purple.smallPrint.card1.body"),
        },
        {
          heading: t("landing.purple.smallPrint.card2.title"),
          body: t("landing.purple.smallPrint.card2.body"),
        },
        {
          heading: t("landing.purple.smallPrint.card3.title"),
          body: t("landing.purple.smallPrint.card3.body"),
        },
      ],
    },
    roadmap: {
      title: t("landing.purple.roadmap.title"),
      body: t("landing.purple.roadmap.body"),
      workshop: t("landing.purple.roadmap.workshop"),
      mobileTitle: t("landing.purple.roadmap.mobileTitle"),
      mobileBody: t("landing.purple.roadmap.mobileBody"),
      withMobile: t("landing.purple.roadmap.withMobile"),
      syncTitle: t("landing.purple.roadmap.syncTitle"),
      syncBody: t("landing.purple.roadmap.syncBody"),
      exploring: t("landing.purple.roadmap.exploring"),
      cloudTitle: t("landing.purple.roadmap.cloudTitle"),
      cloudBody: t("landing.purple.roadmap.cloudBody"),
    },
    access: {
      eyebrow: t("landing.purple.access.eyebrow"),
      title: t("landing.purple.access.title"),
      included: t("landing.purple.access.included"),
      free: t("landing.purple.access.free"),
      body: t("landing.purple.access.body"),
      platforms: t("landing.purple.access.platforms"),
      noPlansTitle: t("landing.purple.access.noPlansTitle"),
      noPlansBody: t("landing.purple.access.noPlansBody"),
      noSubscription: t("landing.purple.access.noSubscription"),
      noSubscriptionDetail: t("landing.purple.access.noSubscriptionDetail"),
      noTrial: t("landing.purple.access.noTrial"),
      noTrialDetail: t("landing.purple.access.noTrialDetail"),
    },
    finalCta: {
      title: t("landing.purple.final.title"),
      body: t("landing.purple.final.body"),
    },
    footer: {
      label: t("landing.purple.footer.label"),
    },
  } as const;
}
