import equal from "deep-equal"
import { TextChannel } from "discord.js"
import { useTryAsync } from "no-try"
import { BaseGuildCache, ChannelCleaner, DateHelper } from "nova-bot"

import Entry from "./Entry"
import Reminder, { iReminder } from "./Reminder"

export default class GuildCache extends BaseGuildCache<Entry, GuildCache> {
	public reminders: Reminder[] = []
	public draft: Reminder | undefined

	public onConstruct(): void {}

	public resolve(resolve: (cache: GuildCache) => void): void {
		this.ref.onSnapshot(snap => {
			if (snap.exists) {
				this.entry = snap.data()!
				resolve(this)
			}
		})
		this.ref.collection("reminders").onSnapshot(snap => {
			this.reminders = snap.docs
				.filter(doc => doc.id !== "draft")
				.map(doc => new Reminder(doc.data() as iReminder))
			const draft = snap.docs.find(doc => doc.id === "draft")
			this.draft = draft ? new Reminder(draft.data() as iReminder) : undefined
		})
	}

	/**
	 * Method run every minute
	 */
	public async updateMinutely(debug: number) {
		await this.updateRemindersChannel()
	}

	public async updateRemindersChannel() {
		const remindersChannelId = this.getRemindersChannelId()
		if (!remindersChannelId) return

		// Remove expired reminders
		for (const reminder of this.reminders) {
			if (reminder.value.due_date < Date.now()) {
				this.reminders = this.reminders.filter(rem => rem.value.id !== reminder.value.id)
				await this.getReminderDoc(reminder.value.id).delete()
				await this.setRemindersMessageIds(this.getRemindersMessageIds().slice(1))
			}
		}

		const embeds = this.reminders
			.sort((a, b) => b.value.due_date - a.value.due_date)
			.map(reminder => reminder.getEmbed(this.guild))

		let remindersMessageIds = this.getRemindersMessageIds()

		if (remindersMessageIds.length > embeds.length) {
			const diff = remindersMessageIds.length - embeds.length
			await this.setRemindersMessageIds(remindersMessageIds.slice(diff))
			remindersMessageIds = this.getRemindersMessageIds()
		}

		if (embeds.length > remindersMessageIds.length) {
			const diff = embeds.length - remindersMessageIds.length
			await this.setRemindersMessageIds([...remindersMessageIds, ...Array(diff).fill("")])
			remindersMessageIds = this.getRemindersMessageIds()
		}

		const [err, messages] = await useTryAsync(async () => {
			const remindersMessageIds = this.getRemindersMessageIds()
			const cleaner = new ChannelCleaner<Entry, GuildCache>(
				this,
				remindersChannelId,
				remindersMessageIds
			)
			await cleaner.clean()

			if (!equal(remindersMessageIds, this.getRemindersMessageIds())) {
				await this.setRemindersMessageIds(remindersMessageIds)
			}

			return cleaner.getMessages()
		})

		if (err) {
			if (err.message === "no-channel") {
				logger.warn(`Guild(${this.guild.name}) has no Channel(${remindersChannelId})`)
				await this.setRemindersChannelId("")
				return
			}
			if (err.name === "HTTPError") {
				logger.warn(`Failed to clean channel:`, err)
				return
			}
			throw err
		}

		for (let i = 0; i < embeds.length; i++) {
			const messageId = this.getRemindersMessageIds()[i]!
			const embed = embeds[i]!
			const message = messages.get(messageId)!
			message.edit({ embeds: [embed] })
		}
	}

	public async updatePingChannel(reminder: Reminder) {
		const pingChannelId = this.getPingChannelId()

		const channel = this.guild.channels.cache.get(pingChannelId)
		if (channel instanceof TextChannel) {
			channel.send({
				content: `${reminder.getPingString(this.guild)}\n${
					reminder.value.title
				} is due in ${new DateHelper(reminder.value.due_date).getTimeLeft()}!`,
				embeds: [reminder.getEmbed(this.guild)]
			})
		}
	}

	public getDraftDoc() {
		return this.getReminderDoc("draft")
	}

	public getReminderDoc(reminderId?: string) {
		return reminderId
			? this.ref.collection("reminders").doc(reminderId)
			: this.ref.collection("reminders").doc()
	}

	public getRemindersChannelId() {
		return this.entry.reminders_channel_id
	}

	public async setRemindersChannelId(reminders_channel_id: string) {
		this.entry.reminders_channel_id = reminders_channel_id
		await this.ref.update({ reminders_channel_id })
	}

	public getRemindersMessageIds() {
		return [...this.entry.reminders_message_ids]
	}

	public async setRemindersMessageIds(reminders_message_ids: string[]) {
		this.entry.reminders_message_ids = reminders_message_ids
		await this.ref.update({ reminders_message_ids })
	}

	public getPingChannelId() {
		return this.entry.ping_channel_id
	}

	public async setPingChannelId(ping_channel_id: string) {
		this.entry.ping_channel_id = ping_channel_id
		await this.ref.update({ ping_channel_id })
	}
}
