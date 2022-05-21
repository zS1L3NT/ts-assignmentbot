import { TextChannel } from "discord.js"
import { BaseCommand, CommandHelper, IsAdminMiddleware, ResponseBuilder } from "nova-bot"

import Entry from "../../data/Entry"
import GuildCache from "../../data/GuildCache"

export default class extends BaseCommand<Entry, GuildCache> {
	override defer = true
	override ephemeral = true
	override data = {
		description: "Set the channel that all the Reminder embeds show up in",
		options: [
			{
				name: "channel",
				description: [
					"The channel which you would want reminders to be sent to",
					"Leave this empty to unset the log channel"
				].join("\n"),
				type: "channel" as const,
				requirements: "Valid Text Channel",
				required: false,
				default: "Unsets the channel"
			}
		]
	}

	override middleware = [new IsAdminMiddleware()]

	override condition(helper: CommandHelper<Entry, GuildCache>) {}

	override converter(helper: CommandHelper<Entry, GuildCache>) {}

	override async execute(helper: CommandHelper<Entry, GuildCache>) {
		const oldChannelId = helper.cache.entry.reminders_channel_id
		const channel = helper.channel("channel")

		if (channel instanceof TextChannel) {
			switch (channel.id) {
				case helper.cache.getRemindersChannelId():
					helper.respond(
						ResponseBuilder.bad("This channel is already the Reminders channel!")
					)
					break
				case helper.cache.getPingChannelId():
					helper.respond(ResponseBuilder.bad("This channel is already the ping channel!"))
					break
				default:
					await helper.cache.setRemindersChannelId(channel.id)
					helper.cache.updateMinutely()
					helper.respond(
						ResponseBuilder.good(`Reminders channel reassigned to \`#${channel.name}\``)
					)
					helper.cache.logger.log({
						member: helper.member,
						title: `Reminders channel changed`,
						description: [
							`<@${helper.member.id}> changed the reminders channel`,
							oldChannelId ? `**Old Reminders Channel**: <#${oldChannelId}>` : "",
							`**New Reminders Channel**: <#${channel.id}>`
						].join("\n"),
						command: "set-reminders-channel",
						color: "BLUE"
					})
					break
			}
		} else if (channel === null) {
			await helper.cache.setRemindersChannelId("")
			helper.respond(ResponseBuilder.good(`Reminders channel unassigned`))
			helper.cache.logger.log({
				member: helper.member,
				title: `Reminders channel unassigned`,
				description: `<@${helper.member.id}> unassigned the reminders channel\b**Old Reminders Channel**: <#${oldChannelId}>`,
				command: "set-reminders-channel",
				color: "BLUE"
			})
		} else {
			helper.respond(ResponseBuilder.bad(`Please select a text channel`))
		}
	}
}
